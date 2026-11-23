// Quick self-check for the scheduling engine. Run with:  npm run test:scheduler
// It builds a pretend week, runs the planner and checks the rules that matter
// (no clashes with classes/routine, deadlines respected, missed work rescheduled...).

import assert from "node:assert/strict";
import { defaultSettings } from "../config/defaults";
import type { Block, ClassSession, Exam, Subject, Task } from "../lib/types";
import { formatDurationShort, parseDuration } from "../lib/duration";
import {
  MIN,
  plannedMinutes,
  remainingMinutes,
  atTime,
  buildStudyTasks,
  classIntervals,
  dayWindow,
  planSchedule,
  rescheduleMissed,
  routineIntervals,
  startOfDay,
  addDays,
} from "../lib/scheduler/index";

// Wednesday 18 Nov 2026, 12:52 (local time)
const now = new Date(2026, 10, 18, 12, 52).getTime();
const today = startOfDay(now);
const at = (daysFromToday: number, hhmm: string) => atTime(addDays(today, daysFromToday), hhmm);
const iso = (ms: number) => new Date(ms).toISOString();

const settings = defaultSettings();

const subjects: Subject[] = [
  { id: "math", name: "Math", color: "teal", studySlots: [{ day: 4, start: "08:00", end: "09:00" }] }, // Thursday 8-9
  { id: "phy", name: "Physics", color: "blue", studySlots: [] },
  { id: "cs", name: "Programming", color: "purple", studySlots: [] },
];

const classes: ClassSession[] = [
  { id: "c1", subjectId: "math", day: 1, start: "08:00", end: "10:00", kind: "lecture" },
  { id: "c2", subjectId: "phy", day: 3, start: "09:00", end: "11:00", kind: "lecture" },
  { id: "c3", subjectId: "cs", day: 4, start: "14:00", end: "16:00", kind: "lab" },
  { id: "c4", subjectId: "math", day: 5, start: "09:00", end: "11:00", kind: "tutorial" },
];

const task = (p: Partial<Task> & Pick<Task, "id" | "title" | "dueAt" | "estimateMin">): Task => ({
  subjectId: null,
  kind: "assignment",
  loggedMin: 0,
  priority: "medium",
  status: "todo",
  createdAt: iso(now),
  completedAt: null,
  ...p,
});

const tasks: Task[] = [
  task({ id: "t1", title: "Math assignment 3", subjectId: "math", dueAt: iso(at(3, "23:59")), estimateMin: 180 }),
  task({ id: "t2", title: "Physics lab report", subjectId: "phy", dueAt: iso(at(2, "17:00")), estimateMin: 120, priority: "high" }),
  task({ id: "t3", title: "Programming project", subjectId: "cs", dueAt: iso(at(9, "23:59")), estimateMin: 420 }),
];

function checkNoClashes(blocks: Pick<Block, "start" | "end">[]) {
  const list = blocks.map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) })).sort((a, b) => a.start - b.start);
  for (let i = 1; i < list.length; i++) assert.ok(list[i].start >= list[i - 1].end, "two sessions overlap");

  for (const b of list) {
    const day = startOfDay(b.start);
    const win = dayWindow(day, settings);
    assert.ok(b.start >= win.start && b.end <= win.end, "session outside wake/bed window");
    for (const busy of [
      ...classIntervals(day, classes, settings.scheduling.classBufferMin),
      ...routineIntervals(day, settings.routine),
    ]) {
      assert.ok(b.end <= busy.start || b.start >= busy.end, "session overlaps a class or routine item");
    }
  }
}

const minutes = (b: { start: string; end: string }) => (Date.parse(b.end) - Date.parse(b.start)) / MIN;
const toBlocks = (list: ReturnType<typeof planSchedule>["create"]): Block[] =>
  list.map((b, i) => ({ ...b, id: `b${i}` }));

// ── 1. Normal planning ─────────────────────────────────────────────────────────────────
for (const strategy of ["balanced", "early"] as const) {
  const s = { ...settings, scheduling: { ...settings.scheduling, strategy } };
  const plan = planSchedule({ now, mode: "full", settings: s, subjects, classes, tasks, blocks: [] });
  assert.equal(plan.unscheduled.length, 0, `${strategy}: everything should fit`);
  checkNoClashes(plan.create);

  for (const t of tasks) {
    const mine = plan.create.filter((b) => b.taskId === t.id);
    const total = mine.reduce((sum, b) => sum + minutes(b), 0);
    assert.equal(total, t.estimateMin, `${strategy}: ${t.title} planned minutes`);
    for (const b of mine) {
      assert.ok(Date.parse(b.start) >= now, `${strategy}: session in the past`);
      assert.ok(Date.parse(b.end) <= Date.parse(t.dueAt), `${strategy}: session after deadline`);
    }
  }

  const perDay = new Map<number, number>();
  for (const b of plan.create) perDay.set(startOfDay(Date.parse(b.start)), (perDay.get(startOfDay(Date.parse(b.start))) || 0) + minutes(b));
  for (const [, m] of perDay) assert.ok(m <= s.scheduling.maxDailyStudyMin, `${strategy}: daily limit respected`);

  if (strategy === "balanced") {
    // Math time reserved for Thursday 08:00-09:00 should be used by the Math assignment.
    const mathThursday = plan.create.find(
      (b) => b.taskId === "t1" && Date.parse(b.start) === at(1, "08:00"),
    );
    assert.ok(mathThursday, "Math assignment should use the reserved Thursday 8-9 slot");
    const days = new Set(plan.create.filter((b) => b.taskId === "t3").map((b) => startOfDay(Date.parse(b.start))));
    assert.ok(days.size >= 3, "balanced strategy spreads the long project over several days");
  }
  console.log(`✓ ${strategy}: ${plan.create.length} sessions planned, no clashes, deadlines met`);
}

// ── 2. Pinned ("locked") session is never moved ────────────────────────────────────────
{
  const pinned: Block = { id: "pin", taskId: "t1", start: iso(at(1, "17:30")), end: iso(at(1, "18:30")), status: "planned", locked: true };
  const plan = planSchedule({ now, mode: "full", settings, subjects, classes, tasks, blocks: [pinned] });
  assert.ok(!plan.removeIds.includes("pin"), "locked session must stay");
  const mathMin = plan.create.filter((b) => b.taskId === "t1").reduce((s, b) => s + minutes(b), 0) + 60;
  assert.equal(mathMin, 180, "pinned minutes count toward the estimate");
  checkNoClashes([...plan.create, pinned]);
  console.log("✓ pinned session kept, remaining time planned around it");
}

// ── 3. Missed sessions get rescheduled ─────────────────────────────────────────────────
{
  const first = planSchedule({ now: at(0, "06:00"), mode: "full", settings, subjects, classes, tasks, blocks: [] });
  const existing = toBlocks(first.create);
  const early = existing.filter((b) => Date.parse(b.end) < now);
  const later = now + 6 * 60 * MIN; // pretend it is the evening and nothing was done
  const result = rescheduleMissed({ now: later, settings, subjects, classes, tasks, blocks: existing });
  assert.ok(result.movedCount >= early.length, "counts missed sessions");
  for (const b of result.create) assert.ok(Date.parse(b.start) >= later, "rescheduled session starts in the future");
  const keptIds = new Set(existing.filter((b) => !result.removeIds.includes(b.id)).map((b) => b.id));
  const all = [...existing.filter((b) => keptIds.has(b.id)), ...result.create.map((b, i) => ({ ...b, id: `n${i}` }))];
  checkNoClashes(all);
  for (const t of tasks) {
    const total = all.filter((b) => b.taskId === t.id).reduce((s, b) => s + minutes(b), 0);
    if (result.unscheduled.some((u) => u.taskId === t.id)) continue;
    assert.equal(total, t.estimateMin, `${t.title}: all minutes planned again`);
  }
  console.log(`✓ reschedule: ${result.movedCount} missed session(s) moved (${result.usedMode})`);
}

// ── 4. Finished work is not planned again ──────────────────────────────────────────────
{
  const done: Block = { id: "d1", taskId: "t2", start: iso(at(0, "13:40")), end: iso(at(0, "14:40")), status: "done", locked: false };
  const plan = planSchedule({ now, mode: "full", settings, subjects, classes, tasks, blocks: [done] });
  const total = plan.create.filter((b) => b.taskId === "t2").reduce((s, b) => s + minutes(b), 0);
  assert.equal(total, 60, "only the remaining 60 min of the physics report is planned");
  console.log("✓ done sessions count as progress");
}

// ── 5. Impossible deadlines are reported, not hidden ───────────────────────────────────
{
  const huge = [task({ id: "x", title: "Impossible", dueAt: iso(now + 6 * 60 * MIN), estimateMin: 20 * 60 })];
  const plan = planSchedule({ now, mode: "full", settings, subjects, classes, tasks: huge, blocks: [] });
  assert.ok(plan.unscheduled.length === 1 && plan.unscheduled[0].missingMin > 0, "shortfall should be reported");
  console.log(`✓ impossible task flagged (${plan.unscheduled[0].missingMin} min short)`);
}

// ── 6. Exam study plan ─────────────────────────────────────────────────────────────────
{
  const exam: Exam = {
    id: "e1",
    subjectId: "math",
    title: "Math final",
    startsAt: iso(at(12, "09:00")),
    durationMin: 120,
    topics: ["Algebra", "Calculus", "Statistics"],
    prepMin: 360,
  };
  const drafts = buildStudyTasks(exam, subjects[0], now);
  assert.equal(drafts.length, 4, "3 topics + recap");
  const total = drafts.reduce((s, d) => s + d.estimateMin, 0);
  assert.ok(Math.abs(total - 360) <= 30, "study time adds up to roughly what you asked for");
  const dues = drafts.map((d) => Date.parse(d.dueAt));
  assert.deepEqual([...dues].sort((a, b) => a - b), dues, "deadlines increase");
  assert.ok(dues[dues.length - 1] < Date.parse(exam.startsAt), "everything is due before the exam");
  console.log(`✓ study plan: ${drafts.length} tasks, ${total} min`);
}

// ── 7. Work already done shrinks the plan ──────────────────────────────────────────────
{
  const t = task({ id: "p", title: "Report", subjectId: "phy", dueAt: iso(at(5, "23:00")), estimateMin: 180 });
  const first = planSchedule({ now, mode: "full", settings, subjects, classes, tasks: [t], blocks: [] });
  const blocks = toBlocks(first.create);
  assert.equal(plannedMinutes("p", blocks), 180);

  // 100 minutes worked with the timer → only 80 should stay planned.
  const worked = { ...t, loggedMin: 100 };
  const trim = planSchedule({ now, mode: "trim", settings, subjects, classes, tasks: [worked], blocks });
  const after = [...blocks.filter((b) => !trim.removeIds.includes(b.id)), ...toBlocks(trim.create)];
  assert.equal(plannedMinutes("p", after), 80, "planned time follows the remaining time");
  assert.equal(trim.unscheduled.length, 0);
  for (const b of trim.create) assert.ok(blocks.some((o) => o.start === b.start), "shortened sessions keep their start time");
  checkNoClashes(after);

  // Everything worked → nothing left planned.
  const all = planSchedule({ now, mode: "trim", settings, subjects, classes, tasks: [{ ...t, loggedMin: 180 }], blocks });
  assert.equal(plannedMinutes("p", [...blocks.filter((b) => !all.removeIds.includes(b.id)), ...toBlocks(all.create)]), 0);

  // Trim mode never touches missed sessions (the person reschedules those on purpose).
  const later = now + 2 * 24 * 60 * MIN;
  const keepMissed = planSchedule({ now: later, mode: "trim", settings, subjects, classes, tasks: [t], blocks });
  const missedIds = blocks.filter((b) => Date.parse(b.end) <= later).map((b) => b.id);
  assert.ok(missedIds.every((id) => !keepMissed.removeIds.includes(id)), "trim leaves missed sessions alone");
  console.log("✓ trim: planned time follows progress, missed sessions untouched");
}

// ── 8. Partly worked sessions and how progress is counted ──────────────────────────────
{
  const t = task({ id: "q", title: "Essay", dueAt: iso(at(4, "20:00")), estimateMin: 60, loggedMin: 45 });
  const part: Block = { id: "pb", taskId: "q", start: iso(at(1, "20:00")), end: iso(at(1, "21:00")), status: "planned", locked: false, focusedMin: 20 };
  assert.equal(plannedMinutes("q", [part]), 40, "worked minutes inside a session are not planned twice");
  assert.equal(remainingMinutes(t, [part]), 15);

  // A session ticked in the new version counts through loggedMin only (no double counting) …
  const tickedNew: Block = { ...part, status: "done", creditedMin: 40 };
  assert.equal(remainingMinutes({ ...t, loggedMin: 60 }, [tickedNew]), 0);
  // … while a session ticked in the first version (no creditedMin) still counts, so old data keeps working.
  const tickedOld: Block = { id: "ob", taskId: "q", start: part.start, end: part.end, status: "done", locked: false };
  assert.equal(remainingMinutes({ ...t, loggedMin: 0 }, [tickedOld]), 0);

  // 12 minute tasks (not a multiple of 5) are planned without trouble.
  const small = task({ id: "s", title: "Quick reading", dueAt: iso(at(2, "20:00")), estimateMin: 12 });
  const plan = planSchedule({ now, mode: "full", settings, subjects, classes, tasks: [small], blocks: [] });
  assert.equal(plan.unscheduled.length, 0);
  const planned = plan.create.reduce((s, b) => s + minutes(b), 0);
  assert.ok(planned >= 12 && planned <= 15, `12 minute task planned as ${planned} min`);
  // Planning again must not shorten it (rounding is ignored).
  const again = planSchedule({ now, mode: "trim", settings, subjects, classes, tasks: [small], blocks: toBlocks(plan.create) });
  assert.equal(again.removeIds.length, 0);
  console.log("✓ progress: partial sessions, old data and 12-minute tasks all work");
}

// ── 9. A preferred time replaces the planner's sessions ────────────────────────────────
{
  const t = task({ id: "r", title: "Lab prep", subjectId: "cs", dueAt: iso(at(4, "23:00")), estimateMin: 60 });
  const first = toBlocks(planSchedule({ now, mode: "full", settings, subjects, classes, tasks: [t], blocks: [] }).create);
  const pinned: Block = { id: "mine", taskId: "r", start: iso(at(2, "20:00")), end: iso(at(2, "21:00")), status: "planned", locked: true };
  // The page drops the old unlocked sessions and adds the pinned one; the planner fills in whatever is left.
  const plan = planSchedule({ now, mode: "incremental", settings, subjects, classes, tasks: [t], blocks: [pinned] });
  assert.equal(plan.create.length, 0, "a 1 hour preferred time covers a 1 hour task completely");
  assert.ok(first.length > 0);
  const half: Block = { ...pinned, end: iso(at(2, "20:30")) };
  const rest = planSchedule({ now, mode: "incremental", settings, subjects, classes, tasks: [t], blocks: [half] });
  assert.equal(rest.create.reduce((s, b) => s + minutes(b), 0), 30, "a shorter preferred time leaves the rest to the planner");
  console.log("✓ preferred time: covers the task or leaves the remainder to the planner");
}

// ── 10. Typed durations ────────────────────────────────────────────────────────────────
{
  const cases: [string, number | null][] = [
    ["12", 12], ["45m", 45], ["45 min", 45], ["1h", 60], ["1.5h", 90], ["1h30", 90], ["1h 30m", 90],
    ["1:30", 90], ["2 hours 15 minutes", 135], ["2,5h", 150], ["", null], ["abc", null], ["0", null],
  ];
  for (const [text, want] of cases) assert.equal(parseDuration(text), want, `parseDuration("${text}")`);
  assert.equal(parseDuration(formatDurationShort(75)), 75);
  console.log("✓ typed durations understood");
}

console.log("\nAll scheduler checks passed.");
