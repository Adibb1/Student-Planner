// The auto-scheduler: turns "I need 3 hours for this assignment before Friday" into
// concrete study sessions placed in your real free time.
//
// How it thinks:
//  1. Work out what is still left to do for every unfinished task.
//  2. Work out each day's free time (see freeTime.ts).
//  3. Handle tasks in deadline order (earliest first) and place their sessions:
//       - "balanced": sessions are spread out before the deadline
//       - "early": sessions are packed into the earliest free time
//     Time you reserved for a subject (e.g. Math on Wednesday 08:00-09:00) is used first.
//  4. If something cannot fit, it is reported in `unscheduled` instead of being hidden.

import type { Block, ClassSession, Settings, Subject, Task } from "../types";
import { type FreeSlot, type StretchSlot, freeSlotsForDay, stretchSlotsForDay } from "./freeTime";
import { blockMinutes, plannedMinutes, remainingMinutes } from "./progress";
import {
  DAY,
  type Interval,
  MIN,
  addDays,
  atTime,
  ceilTo,
  floorMinutes,
  intersect,
  startOfDay,
  subtractIntervals,
} from "./time";

export type PlanMode = "incremental" | "full" | "trim";

export type PlanInput = {
  now: number;
  /**
   * "incremental": keep sessions that are still in the future, only place what is missing.
   * "full": throw away every unlocked, unfinished session and plan from scratch.
   * "trim": only remove or shorten future sessions that are no longer needed (work already done).
   */
  mode: PlanMode;
  settings: Settings;
  subjects: Subject[];
  classes: ClassSession[];
  tasks: Task[];
  blocks: Block[];
};

export type NewBlock = Omit<Block, "id">;

export type PlanResult = {
  create: NewBlock[];
  removeIds: string[];
  unscheduled: { taskId: string; missingMin: number }[];
  warnings: string[];
  /** Set when sessions had to be squeezed into relax time or late nights. */
  stretch?: { relaxMin: number; lateMin: number; latestEnd: number | null };
};

const MAX_HORIZON_DAYS = 60;
const OVERDUE_GRACE_DAYS = 2;

/** Splits a number of minutes into sensible session lengths. */
export function splitSessions(total: number, cfg: Settings["scheduling"]): number[] {
  const max = Math.max(15, cfg.maxSessionMin);
  const pref = Math.min(Math.max(15, cfg.sessionMin), max);
  const min = Math.min(Math.max(10, cfg.minSessionMin), pref);
  const rounded = Math.ceil(total / 5) * 5;
  if (rounded <= 0) return [];
  if (rounded <= max) return [rounded];

  const n = Math.ceil(rounded / pref);
  const base = Math.min(max, Math.max(min, Math.ceil(rounded / n / 5) * 5));
  const out: number[] = [];
  let left = rounded;
  while (left > 0) {
    const s = Math.min(base, left);
    out.push(s);
    left -= s;
  }
  if (out.length > 1 && out[out.length - 1] < min) {
    const tail = out.pop() as number;
    out[out.length - 1] += tail;
    if (out[out.length - 1] > max) {
      const sum = out.pop() as number;
      const a = Math.ceil(sum / 2 / 5) * 5;
      out.push(a, sum - a);
    }
  }
  return out;
}

/** Late-night sessions are given up first, then relax-time ones, then normal ones. */
const stretchRank = (b: Pick<Block, "stretch">) => (b.stretch === "late" ? 2 : b.stretch === "relax" ? 1 : 0);

/** Cuts `cut` out of every slot but keeps each slot's subject tag. */
function carve(slots: FreeSlot[], cut: Interval): FreeSlot[] {
  const out: FreeSlot[] = [];
  for (const s of slots) {
    for (const piece of subtractIntervals([{ start: s.start, end: s.end }], [cut])) {
      out.push({ start: piece.start, end: piece.end, subjectId: s.subjectId });
    }
  }
  return out;
}

/** Which day (index in the task's day list) to try first for session number k of n. */
function dayOrder(k: number, n: number, dayCount: number, strategy: Settings["scheduling"]["strategy"]) {
  const all = Array.from({ length: dayCount }, (_, i) => i);
  if (strategy === "early" || dayCount === 1) return all;
  const target = n >= dayCount ? k % dayCount : Math.min(dayCount - 1, Math.floor(((k + 0.35) * dayCount) / n));
  const after = all.filter((i) => i >= target);
  const before = all.filter((i) => i < target).reverse();
  return [...after, ...before];
}

export function planSchedule(input: PlanInput): PlanResult {
  const { now, mode, settings, subjects, classes, tasks, blocks } = input;
  const cfg = settings.scheduling;
  const warnings: string[] = [];

  const todo = tasks.filter((t) => t.status === "todo");
  const todoIds = new Set(todo.map((t) => t.id));
  const earliest = ceilTo(now + 5 * MIN, 5);

  // ── 1. Which existing sessions stay, which are thrown away ───────────────────────────
  const keep: Block[] = [];
  const removeIds: string[] = [];
  for (const b of blocks) {
    if (b.status === "done") {
      keep.push(b);
    } else if (!todoIds.has(b.taskId)) {
      removeIds.push(b.id); // belongs to a finished or deleted task
    } else if (Date.parse(b.end) <= now) {
      // missed → its minutes go back to "still to do" (trim mode leaves it for you to reschedule)
      if (mode === "trim") keep.push(b);
      else removeIds.push(b.id);
    } else if (b.locked || mode !== "full") {
      keep.push(b);
    } else {
      removeIds.push(b.id);
    }
  }

  // ── 1b. Shorten or drop future sessions that are no longer needed (you already did the work) ──
  const pendingCreate: NewBlock[] = [];
  for (const t of todo) {
    const ahead = keep.filter((b) => Date.parse(b.end) > now || b.status === "done");
    let excess = plannedMinutes(t.id, ahead) - remainingMinutes(t, keep);
    if (excess < 5) continue; // ignore rounding differences
    const latestFirst = keep
      .filter((b) => b.taskId === t.id && b.status === "planned" && !b.locked && Date.parse(b.start) > now)
      .sort((a, b) => stretchRank(b) - stretchRank(a) || Date.parse(b.start) - Date.parse(a.start));
    for (const b of latestFirst) {
      if (excess < 5) break;
      const len = blockMinutes(b);
      keep.splice(keep.indexOf(b), 1);
      removeIds.push(b.id);
      if (len <= excess) {
        excess -= len;
        continue;
      }
      const newLen = Math.floor((len - excess) / 5) * 5;
      excess = 0;
      if (newLen >= 10) {
        const shorter: NewBlock = {
          taskId: t.id,
          start: b.start,
          end: new Date(Date.parse(b.start) + newLen * MIN).toISOString(),
          status: "planned",
          locked: false,
          ...(b.stretch ? { stretch: b.stretch } : {}),
        };
        pendingCreate.push(shorter);
        keep.push({ ...shorter, id: `trim-${b.id}` });
      }
    }
  }
  if (mode === "trim") return { create: pendingCreate, removeIds, unscheduled: [], warnings };

  // ── 2. What is still left for each task ──────────────────────────────────────────────
  // `soft` = the deadline you gave, `hard` = the very last moment work may be planned
  // (e.g. when the exam starts). Without a hard limit the two are the same.
  const hardOf = (t: Task) => {
    if (!t.hardDueAt) return null;
    const hard = Date.parse(t.hardDueAt);
    // An overdue ordinary task can still be rescheduled; work for an exam that already started cannot.
    return hard <= now && !t.examId ? null : hard;
  };
  const softOf = (t: Task) => {
    const due = Date.parse(t.dueAt);
    const hard = hardOf(t);
    if (due > now) return hard !== null ? Math.min(due, hard) : due;
    // already overdue: with a hard limit use it, otherwise a short grace period
    return hard !== null ? hard : now + OVERDUE_GRACE_DAYS * DAY;
  };
  const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
  const stretchAllowed = cfg.allowStretch !== false;

  const work = todo
    .filter((t) => {
      const hard = hardOf(t);
      return hard === null || hard > earliest + 10 * MIN; // nothing can be planned after the exam started
    })
    .map((t) => {
      const soft = softOf(t);
      const hard = hardOf(t);
      return {
        task: t,
        left: Math.max(0, remainingMinutes(t, keep) - plannedMinutes(t.id, keep)),
        overdue: Date.parse(t.dueAt) <= now && hard === null,
        soft,
        hard: hard !== null ? Math.max(hard, soft) : soft,
        canStretch: stretchAllowed && hard !== null && t.allowOvertime !== false,
      };
    })
    .filter((w) => w.left > 0)
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.soft !== b.soft) return a.soft - b.soft;
      return priorityWeight[a.task.priority] - priorityWeight[b.task.priority];
    });

  const result: PlanResult = { create: pendingCreate, removeIds, unscheduled: [], warnings };
  if (work.length === 0) return result;

  // ── 3. Free time, day by day (computed when first needed) ───────────────────────────
  const today = startOfDay(now);
  const keptIntervals: Interval[] = keep.map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  const dayLoad = new Map<number, number>(); // study minutes already planned per day
  for (const b of keep) {
    const day = startOfDay(Date.parse(b.start));
    dayLoad.set(day, (dayLoad.get(day) || 0) + Math.round((Date.parse(b.end) - Date.parse(b.start)) / MIN));
  }

  const slotCache = new Map<number, FreeSlot[]>();
  const slotsOf = (day: number): FreeSlot[] => {
    let slots = slotCache.get(day);
    if (!slots) {
      slots = freeSlotsForDay(day, { settings, classes, subjects, obstacles: keptIntervals });
      if (day === today) slots = carve(slots, { start: day, end: earliest });
      slotCache.set(day, slots);
    }
    return slots;
  };

  // Emergency time (relax + late night), only used when everything else is full.
  const stretchCache = new Map<number, StretchSlot[]>();
  const stretchOf = (day: number): StretchSlot[] => {
    let slots = stretchCache.get(day);
    if (!slots) {
      slots = stretchSlotsForDay(day, { settings, classes, obstacles: keptIntervals })
        .map((s) => (s.start < earliest ? { ...s, start: Math.min(s.end, earliest) } : s))
        .filter((s) => s.end - s.start >= 10 * MIN);
      stretchCache.set(day, slots);
    }
    return slots;
  };
  const stretchLoad = new Map<number, number>(); // emergency minutes used per day (to spread them)
  const stretchStats = { relaxMin: 0, lateMin: 0, latestEnd: null as number | null };

  const inWindow = (slot: Interval, day: number, w: Task["window"]): Interval | null => {
    if (!w) return slot;
    const a = atTime(day, w.start);
    let b = atTime(day, w.end);
    if (b <= a) b = atTime(addDays(day, 1), w.end);
    return intersect(slot, { start: a, end: b });
  };

  const missingOf = new Map<string, number>();
  const addMissing = (id: string, min: number) => missingOf.set(id, (missingOf.get(id) || 0) + min);
  const leftovers: { w: (typeof work)[number]; want: number }[] = [];

  // ── 4. Place sessions in normal free time ───────────────────────────────────────────
  for (const w of work) {
    const { task } = w;
    const startAfter = task.startAfter ? Date.parse(task.startAfter) : 0;
    const dayList = (limit: number) => {
      const lastDay = Math.min(startOfDay(limit), addDays(today, MAX_HORIZON_DAYS));
      const list: number[] = [];
      for (let d = today; d <= lastDay; d = addDays(d, 1)) if (d + DAY > startAfter) list.push(d);
      return list;
    };
    const softDays = dayList(w.soft);
    const hardDays = dayList(w.hard);

    const queue = splitSessions(w.left, cfg);
    const total = queue.length;
    const perDayCap = cfg.strategy === "early" ? Infinity : Math.max(1, Math.ceil(total / Math.max(1, softDays.length)));
    const perDayCount = new Map<number, number>();
    let k = 0;

    type Placement = { day: number; start: number; len: number };

    // Looks for a place for one session. pass 1 = follow every preference,
    // pass 2 = allow several sessions per day, other subjects' reserved time and any time of day,
    // pass 3 = also ignore the daily study limit (better than missing the deadline).
    const findSlot = (pass: 1 | 2 | 3, want: number, order: number[], days: number[], limit: number): Placement | null => {
      const minUseful = Math.min(want, cfg.minSessionMin);
      for (const idx of order) {
        const day = days[idx];
        if (pass === 1 && (perDayCount.get(day) || 0) >= perDayCap) continue;
        const capLeft = pass === 3 ? Infinity : cfg.maxDailyStudyMin - (dayLoad.get(day) || 0);
        if (capLeft < minUseful) continue;

        const room = (s: { start: number; end: number }) =>
          Math.min(floorMinutes((s.end - s.start) / MIN, 5), floorMinutes(capLeft, 5));

        const candidates = slotsOf(day)
          .map((s) => {
            const clipped = pass === 1 ? inWindow(s, day, task.window) : s;
            return {
              start: Math.max(ceilTo(clipped ? clipped.start : s.start, 5), ceilTo(startAfter, 5)),
              end: clipped ? Math.min(clipped.end, limit) : 0,
              rank: s.subjectId && s.subjectId === task.subjectId ? 0 : s.subjectId === null ? 1 : 2,
            };
          })
          .filter((s) => s.end - s.start >= 10 * MIN && (pass > 1 || s.rank < 2))
          .sort((a, b) => a.rank - b.rank || a.start - b.start);

        // time reserved for this subject first (a partial fit is fine there),
        const reserved = candidates.find((s) => s.rank === 0 && room(s) >= minUseful);
        // then any slot where the whole session fits,
        const full = candidates.find((s) => room(s) >= want);
        // then any slot where at least a useful part of it fits.
        const partial = candidates.find((s) => room(s) >= minUseful);
        const pick = reserved || full || partial;
        if (pick) return { day, start: pick.start, len: Math.min(want, room(pick)) };
      }
      return null;
    };

    const commit = (p: Placement, stretch?: "relax" | "late") => {
      const end = p.start + p.len * MIN;
      result.create.push({
        taskId: task.id,
        start: new Date(p.start).toISOString(),
        end: new Date(end).toISOString(),
        status: "planned",
        locked: false,
        ...(stretch ? { stretch } : {}),
      });
      // The time is taken now (plus a break afterwards) – remove it from the day's free list.
      const cut = { start: p.start, end: end + cfg.breakMin * MIN };
      slotCache.set(p.day, carve(slotsOf(p.day), cut));
      stretchCache.set(
        p.day,
        stretchOf(p.day).flatMap((s) =>
          subtractIntervals([{ start: s.start, end: s.end }], [cut]).map((x) => ({ ...x, kind: s.kind })),
        ),
      );
      dayLoad.set(p.day, (dayLoad.get(p.day) || 0) + p.len);
      perDayCount.set(p.day, (perDayCount.get(p.day) || 0) + 1);
    };

    while (queue.length > 0) {
      const want = queue.shift() as number;
      const order = dayOrder(k, total, softDays.length, cfg.strategy);
      let placed: Placement | null = null;
      if (softDays.length > 0) {
        placed = findSlot(1, want, order, softDays, w.soft) || findSlot(2, want, order, softDays, w.soft) || findSlot(3, want, order, softDays, w.soft);
      }
      // Not before the deadline you set? Use normal free time up to the hard limit (exam start).
      if (!placed && w.hard > w.soft) {
        const all = hardDays.map((_, i) => i);
        placed = findSlot(2, want, all, hardDays, w.hard) || findSlot(3, want, all, hardDays, w.hard);
      }

      if (!placed || placed.len <= 0) {
        if (w.canStretch) leftovers.push({ w, want });
        else addMissing(task.id, want);
        k++;
        continue;
      }
      commit(placed);
      if (placed.len < want) queue.unshift(want - placed.len); // split the session
      else k++;
    }
  }

  // ── 5. Emergency: relax time first, then late nights, spread over the days ───────────
  // Cost per minute: relax 1, late night 2 → 6.5 (23:00 → 03:00), plus a penalty for every
  // emergency hour already used that day, so the load is shared instead of piled on one night.
  const LATE_BASE = 2;
  const costOf = (s: StretchSlot, start: number, len: number, day: number) => {
    let c: number;
    if (s.kind === "relax") c = 1;
    else {
      const bed = atTime(day, settings.bed) <= atTime(day, settings.wake) ? atTime(addDays(day, 1), settings.bed) : atTime(day, settings.bed);
      const mid = start + (len * MIN) / 2;
      c = LATE_BASE + Math.max(0, (mid - bed) / (60 * MIN)) * 1.5;
    }
    return c + ((stretchLoad.get(day) || 0) / 60) * 0.8;
  };

  for (const { w, want: first } of leftovers) {
    const { task } = w;
    const startAfter = task.startAfter ? Date.parse(task.startAfter) : 0;
    const firstDay = startOfDay(Math.max(now, startAfter)) - DAY; // yesterday's late night may still be ahead
    const lastDay = Math.min(startOfDay(w.hard), addDays(today, MAX_HORIZON_DAYS));
    const queue = [first];
    while (queue.length > 0) {
      const want = queue.shift() as number;
      let best: { day: number; start: number; len: number; kind: "relax" | "late"; score: number } | null = null;
      for (let d = firstDay; d <= lastDay; d = addDays(d, 1)) {
        for (const s of stretchOf(d)) {
          const start = Math.max(ceilTo(s.start, 5), ceilTo(startAfter, 5));
          const end = Math.min(s.end, w.hard);
          const len = Math.min(want, floorMinutes((end - start) / MIN, 5));
          if (len < Math.min(want, cfg.minSessionMin)) continue;
          // prefer fitting the whole session, then the cheapest slot
          const score = costOf(s, start, len, d) + (len < want ? 0.7 : 0);
          if (!best || score < best.score - 1e-9) best = { day: d, start, len, kind: s.kind, score };
        }
      }
      if (!best) {
        addMissing(task.id, want);
        continue;
      }
      const end = best.start + best.len * MIN;
      result.create.push({
        taskId: task.id,
        start: new Date(best.start).toISOString(),
        end: new Date(end).toISOString(),
        status: "planned",
        locked: false,
        stretch: best.kind,
      });
      const cut = { start: best.start, end: end + cfg.breakMin * MIN };
      stretchCache.set(
        best.day,
        stretchOf(best.day).flatMap((s) =>
          subtractIntervals([{ start: s.start, end: s.end }], [cut]).map((x) => ({ ...x, kind: s.kind })),
        ),
      );
      stretchLoad.set(best.day, (stretchLoad.get(best.day) || 0) + best.len);
      dayLoad.set(startOfDay(best.start), (dayLoad.get(startOfDay(best.start)) || 0) + best.len);
      if (best.kind === "relax") stretchStats.relaxMin += best.len;
      else stretchStats.lateMin += best.len;
      stretchStats.latestEnd = Math.max(stretchStats.latestEnd ?? 0, end);
      if (best.len < want) queue.unshift(want - best.len);
    }
  }

  // ── 6. Report ────────────────────────────────────────────────────────────────────────
  for (const [taskId, missing] of missingOf) {
    const t = todo.find((x) => x.id === taskId) as Task;
    result.unscheduled.push({ taskId, missingMin: missing });
    warnings.push(
      t.hardDueAt
        ? `"${t.title}" does not fit before the deadline (${missing} min short), even using relax time and late nights.`
        : `Not enough free time before the deadline for "${t.title}" (${missing} min short).`,
    );
  }
  if (stretchStats.relaxMin + stretchStats.lateMin > 0) {
    result.stretch = stretchStats;
    const parts: string[] = [];
    if (stretchStats.relaxMin) parts.push(`${stretchStats.relaxMin} min of your relax time`);
    if (stretchStats.lateMin) parts.push(`${stretchStats.lateMin} min after your normal bed time`);
    warnings.push(`Tight schedule: used ${parts.join(" and ")} to fit your study plan before the exam.`);
  }

  return result;
}
