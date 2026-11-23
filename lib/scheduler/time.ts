// Small, dependency-free time helpers used by the scheduler.
// All "epoch" numbers are milliseconds. Days are handled in the runtime's local time zone.

import type { HHMM, Weekday } from "../types";

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export type Interval = { start: number; end: number };

export function parseHHMM(value: HHMM): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function toHHMM(minutes: number): HHMM {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Midnight (local) at the start of the day that contains `ms`. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Add whole days (safe across daylight-saving changes). */
export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** The moment "HH:mm" happens on the day that starts at `dayStart`. */
export function atTime(dayStart: number, hhmm: HHMM): number {
  const mins = parseHHMM(hhmm);
  const d = new Date(dayStart);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(mins);
  return d.getTime();
}

export function weekdayOf(ms: number): Weekday {
  return new Date(ms).getDay() as Weekday;
}

export function minutesOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

export function ceilTo(ms: number, stepMin: number): number {
  const step = stepMin * MIN;
  return Math.ceil(ms / step) * step;
}

export function floorMinutes(minutes: number, step = 5): number {
  return Math.floor(minutes / step) * step;
}

export function roundMinutes(minutes: number, step = 5): number {
  return Math.round(minutes / step) * step;
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

export function length(i: Interval): number {
  return Math.max(0, i.end - i.start);
}

/** Sorts and joins overlapping intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push(i);
  }
  return out;
}

/** Takes the `busy` intervals out of the `free` intervals. */
export function subtractIntervals(free: Interval[], busy: Interval[]): Interval[] {
  const blockers = mergeIntervals(busy);
  let result = free.map((i) => ({ ...i }));
  for (const b of blockers) {
    const next: Interval[] = [];
    for (const f of result) {
      if (b.end <= f.start || b.start >= f.end) {
        next.push(f);
        continue;
      }
      if (b.start > f.start) next.push({ start: f.start, end: b.start });
      if (b.end < f.end) next.push({ start: b.end, end: f.end });
    }
    result = next;
  }
  return result;
}

/** The part of `a` that is inside `b`, or null. */
export function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}
