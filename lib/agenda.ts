// Builds the list of things happening on a day: classes + routine + study sessions.
// Used by the Today page and the Timetable page.

import { routineKinds } from "@/config/site";
import {
  addDays,
  atTime,
  classIntervals,
  dayWindow,
  isMissed,
  routineIntervals,
  startOfDay,
  weekdayOf,
} from "@/lib/scheduler";
import type { Block, ClassSession, DayItem, Settings, Subject, Task } from "@/lib/types";

export type AgendaContext = {
  settings: Settings;
  classes: ClassSession[];
  blocks: Block[];
  tasks: Task[];
  subjects: Subject[];
  now: number;
};

const kindLabel = (kind: ClassSession["kind"]) => kind.charAt(0).toUpperCase() + kind.slice(1);

export function buildDayItems(dayStartMs: number, ctx: AgendaContext): DayItem[] {
  const dayStart = startOfDay(dayStartMs);
  const weekday = weekdayOf(dayStart);
  const subjectName = (id?: string | null) => ctx.subjects.find((s) => s.id === id)?.name;
  const items: DayItem[] = [];

  for (const c of ctx.classes.filter((c) => c.day === weekday)) {
    items.push({
      id: `class-${c.id}`,
      kind: "class",
      title: subjectName(c.subjectId) || "Class",
      subtitle: [kindLabel(c.kind), c.room].filter(Boolean).join(" · "),
      start: atTime(dayStart, c.start),
      end: atTime(dayStart, c.end),
      subjectId: c.subjectId,
    });
  }

  for (const r of ctx.settings.routine.filter((r) => r.days.includes(weekday))) {
    items.push({
      id: `routine-${r.id}`,
      kind: "routine",
      title: r.label,
      start: atTime(dayStart, r.start),
      end: atTime(dayStart, r.end),
      routineKind: r.kind,
    });
  }

  for (const b of ctx.blocks) {
    const start = Date.parse(b.start);
    if (startOfDay(start) !== dayStart) continue;
    const task = ctx.tasks.find((t) => t.id === b.taskId);
    if (!task) continue;
    items.push({
      id: `block-${b.id}`,
      kind: "study",
      title: task.title,
      subtitle: subjectName(task.subjectId),
      start,
      end: Date.parse(b.end),
      subjectId: task.subjectId,
      taskId: task.id,
      blockId: b.id,
      done: b.status === "done",
      missed: isMissed(b, ctx.now) && task.status === "todo",
      locked: b.locked,
      stretch: b.stretch,
    });
  }

  return items.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** The Chakra colour name for an agenda item. */
export function itemColor(item: DayItem, subjects: Subject[]): string {
  if (item.kind === "routine") return routineKinds.find((k) => k.value === item.routineKind)?.color || "gray";
  return subjects.find((s) => s.id === item.subjectId)?.color || "gray";
}

/** Planned (not done) sessions that now clash with a class or routine item (after a timetable change). */
export function findClashes(ctx: AgendaContext): Block[] {
  const clashes: Block[] = [];
  for (const b of ctx.blocks) {
    if (b.status !== "planned" || b.locked || b.stretch) continue; // late-night / relax sessions are on purpose
    const start = Date.parse(b.start);
    const end = Date.parse(b.end);
    if (end < ctx.now) continue;
    const day = startOfDay(start);
    const window = dayWindow(day, ctx.settings);
    const busy = [
      ...classIntervals(day, ctx.classes, ctx.settings.scheduling.classBufferMin),
      ...routineIntervals(day, ctx.settings.routine),
    ];
    const outside = start < window.start || end > window.end;
    if (outside || busy.some((i) => start < i.end && end > i.start)) clashes.push(b);
  }
  return clashes;
}

/** Start of the week (Monday) that contains `ms`. */
export function startOfWeek(ms: number): number {
  const day = startOfDay(ms);
  const dow = weekdayOf(day);
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}
