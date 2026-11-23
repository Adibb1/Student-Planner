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
import { type FreeSlot, freeSlotsForDay } from "./freeTime";
import { blockMinutes, plannedMinutes, remainingMinutes } from "./progress";
import {
  DAY,
  type Interval,
  MIN,
  addDays,
  ceilTo,
  floorMinutes,
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
      .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
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
        };
        pendingCreate.push(shorter);
        keep.push({ ...shorter, id: `trim-${b.id}` });
      }
    }
  }
  if (mode === "trim") return { create: pendingCreate, removeIds, unscheduled: [], warnings };

  // ── 2. What is still left for each task ──────────────────────────────────────────────
  const deadlineOf = (t: Task) => {
    const due = Date.parse(t.dueAt);
    return due > now ? due : now + OVERDUE_GRACE_DAYS * DAY;
  };
  const priorityWeight = { high: 0, medium: 1, low: 2 } as const;

  const work = todo
    .map((t) => ({
      task: t,
      left: Math.max(0, remainingMinutes(t, keep) - plannedMinutes(t.id, keep)),
      overdue: Date.parse(t.dueAt) <= now,
      deadline: deadlineOf(t),
    }))
    .filter((w) => w.left > 0)
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.deadline !== b.deadline) return a.deadline - b.deadline;
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

  // ── 4. Place sessions ───────────────────────────────────────────────────────────────
  for (const w of work) {
    const { task, deadline } = w;
    const lastDay = Math.min(startOfDay(deadline), addDays(today, MAX_HORIZON_DAYS));
    const days: number[] = [];
    for (let d = today; d <= lastDay; d = addDays(d, 1)) days.push(d);

    const queue = splitSessions(w.left, cfg);
    const total = queue.length;
    const perDayCap = cfg.strategy === "early" ? Infinity : Math.max(1, Math.ceil(total / days.length));
    const perDayCount = new Map<number, number>();
    let missing = 0;
    let k = 0;

    type Placement = { day: number; start: number; len: number };

    // Looks for a place for one session. pass 1 = follow every preference,
    // pass 2 = allow several sessions per day and other subjects' reserved time,
    // pass 3 = also ignore the daily study limit (better than missing the deadline).
    const findSlot = (pass: 1 | 2 | 3, want: number, order: number[]): Placement | null => {
      const minUseful = Math.min(want, cfg.minSessionMin);
      for (const idx of order) {
        const day = days[idx];
        if (pass === 1 && (perDayCount.get(day) || 0) >= perDayCap) continue;
        const capLeft = pass === 3 ? Infinity : cfg.maxDailyStudyMin - (dayLoad.get(day) || 0);
        if (capLeft < minUseful) continue;

        const room = (s: { start: number; end: number }) =>
          Math.min(floorMinutes((s.end - s.start) / MIN, 5), floorMinutes(capLeft, 5));

        const candidates = slotsOf(day)
          .map((s) => ({
            start: ceilTo(s.start, 5),
            end: Math.min(s.end, deadline),
            rank: s.subjectId && s.subjectId === task.subjectId ? 0 : s.subjectId === null ? 1 : 2,
          }))
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

    while (queue.length > 0) {
      const want = queue.shift() as number;
      const order = dayOrder(k, total, days.length, cfg.strategy);
      const placed = findSlot(1, want, order) || findSlot(2, want, order) || findSlot(3, want, order);

      if (!placed || placed.len <= 0) {
        missing += want;
        k++;
        continue;
      }

      const end = placed.start + placed.len * MIN;
      result.create.push({
        taskId: task.id,
        start: new Date(placed.start).toISOString(),
        end: new Date(end).toISOString(),
        status: "planned",
        locked: false,
      });

      // The time is taken now (plus a break afterwards) – remove it from the day's free list.
      slotCache.set(
        placed.day,
        carve(slotsOf(placed.day), { start: placed.start, end: end + cfg.breakMin * MIN }),
      );
      dayLoad.set(placed.day, (dayLoad.get(placed.day) || 0) + placed.len);
      perDayCount.set(placed.day, (perDayCount.get(placed.day) || 0) + 1);

      if (placed.len < want) queue.unshift(want - placed.len); // split the session
      else k++;
    }

    if (missing > 0) {
      result.unscheduled.push({ taskId: task.id, missingMin: missing });
      warnings.push(`Not enough free time before the deadline for "${task.title}" (${missing} min short).`);
    }
  }

  return result;
}
