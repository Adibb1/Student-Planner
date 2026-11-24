// Works out which parts of a day are free for studying.
//
// Free time = (wake → bed) minus classes (with buffer), minus routine (meals, prayer, bath,
// relax...) minus any sessions that are already fixed in place.

import type { ClassSession, RoutineItem, Settings, Subject, Weekday } from "../types";
import {
  type Interval,
  MIN,
  addDays,
  atTime,
  intersect,
  mergeIntervals,
  parseHHMM,
  subtractIntervals,
  weekdayOf,
} from "./time";

/** A free stretch of time. `subjectId` is set when you reserved it for one subject. */
export type FreeSlot = Interval & { subjectId: string | null };

/** The day's waking window (wake → bed). Bed may be after midnight. */
export function dayWindow(dayStart: number, settings: Pick<Settings, "wake" | "bed">): Interval {
  const start = atTime(dayStart, settings.wake);
  let end = atTime(dayStart, settings.bed);
  if (parseHHMM(settings.bed) <= parseHHMM(settings.wake)) end = atTime(addDays(dayStart, 1), settings.bed);
  return { start, end };
}

export function routineForDay(routine: RoutineItem[], day: Weekday): RoutineItem[] {
  return routine.filter((r) => r.days.includes(day));
}

export function classIntervals(
  dayStart: number,
  classes: ClassSession[],
  bufferMin = 0,
): Interval[] {
  const day = weekdayOf(dayStart);
  return classes
    .filter((c) => c.day === day)
    .map((c) => ({
      start: atTime(dayStart, c.start) - bufferMin * MIN,
      end: atTime(dayStart, c.end) + bufferMin * MIN,
    }));
}

export function routineIntervals(dayStart: number, routine: RoutineItem[]): Interval[] {
  return routineForDay(routine, weekdayOf(dayStart)).map((r) => ({
    start: atTime(dayStart, r.start),
    end: atTime(dayStart, r.end),
  }));
}

export type FreeTimeInput = {
  settings: Settings;
  classes: ClassSession[];
  subjects: Subject[];
  /** Already-taken time (fixed sessions, finished sessions...). */
  obstacles: Interval[];
};

/** Free slots for one day, sorted by start time. Slots reserved for a subject carry its id. */
export function freeSlotsForDay(dayStart: number, input: FreeTimeInput): FreeSlot[] {
  const { settings, classes, subjects, obstacles } = input;
  const window = dayWindow(dayStart, settings);

  const busy = [
    ...classIntervals(dayStart, classes, settings.scheduling.classBufferMin),
    ...routineIntervals(dayStart, settings.routine),
    ...obstacles,
  ];
  const free = subtractIntervals([window], busy);

  // Time you reserved for a specific subject (e.g. "Math homework: Wednesday 08:00-09:00").
  const day = weekdayOf(dayStart);
  const reserved: FreeSlot[] = [];
  for (const subject of subjects) {
    for (const slot of subject.studySlots || []) {
      if (slot.day !== day) continue;
      const range = { start: atTime(dayStart, slot.start), end: atTime(dayStart, slot.end) };
      for (const f of free) {
        const part = intersect(range, f);
        if (part) reserved.push({ ...part, subjectId: subject.id });
      }
    }
  }

  const reservedMerged = mergeIntervals(reserved);
  const general = subtractIntervals(free, reservedMerged).map((i) => ({ ...i, subjectId: null }));
  const all: FreeSlot[] = [...general];
  for (const r of reserved) all.push(r);
  return all.sort((a, b) => a.start - b.start);
}

/** Time that is normally off-limits but can be used in an emergency (exam tomorrow). */
export type StretchSlot = Interval & { kind: "relax" | "late" };

/**
 * Emergency slots for one day: your relax time, and the hours after your bed time
 * up to `latestBed` (e.g. 03:00). Classes and already-taken time are still respected.
 */
export function stretchSlotsForDay(
  dayStart: number,
  input: Pick<FreeTimeInput, "settings" | "classes" | "obstacles">,
): StretchSlot[] {
  const { settings, classes, obstacles } = input;
  const window = dayWindow(dayStart, settings);
  const classBusy = classIntervals(dayStart, classes, settings.scheduling.classBufferMin);
  const out: StretchSlot[] = [];

  // 1. Relax time (inside the waking day).
  const relax = settings.routine
    .filter((r) => r.kind === "relax" && r.days.includes(weekdayOf(dayStart)))
    .map((r) => ({ start: atTime(dayStart, r.start), end: atTime(dayStart, r.end) }));
  const otherRoutine = routineIntervals(
    dayStart,
    settings.routine.filter((r) => r.kind !== "relax"),
  );
  for (const r of relax) {
    const clipped = intersect(r, window);
    if (!clipped) continue;
    for (const piece of subtractIntervals([clipped], [...classBusy, ...otherRoutine, ...obstacles])) {
      if (piece.end - piece.start >= 10 * MIN) out.push({ ...piece, kind: "relax" });
    }
  }

  // 2. Late night: from bed time to the latest allowed time.
  const latest = settings.scheduling.latestBed || "03:00";
  let lateEnd = atTime(dayStart, latest);
  if (parseHHMM(latest) <= parseHHMM(settings.wake)) lateEnd = atTime(addDays(dayStart, 1), latest);
  if (lateEnd > window.end) {
    for (const piece of subtractIntervals([{ start: window.end, end: lateEnd }], [...obstacles])) {
      if (piece.end - piece.start >= 10 * MIN) out.push({ ...piece, kind: "late" });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
