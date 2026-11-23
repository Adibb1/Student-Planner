// Text helpers: turning dates and minutes into friendly words.

import { DAY, HOUR, MIN, startOfDay } from "@/lib/scheduler/time";

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "08:30" → "8:30 AM" (uses your phone/computer language settings). */
export function fmtHHMM(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return fmtTime(d.getTime());
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

export function fmtDateLong(ms: number): string {
  return new Date(ms).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

export function fmtDateTime(ms: number): string {
  return `${fmtDate(ms)}, ${fmtTime(ms)}`;
}

/** 90 → "1 h 30 min" */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export type Countdown = { days: number; hours: number; minutes: number; past: boolean };

export function countdown(target: number, now: number): Countdown {
  const diff = target - now;
  const abs = Math.abs(diff);
  return {
    days: Math.floor(abs / DAY),
    hours: Math.floor((abs % DAY) / HOUR),
    minutes: Math.floor((abs % HOUR) / MIN),
    past: diff < 0,
  };
}

/** "in 3 days", "in 5 h", "2 days ago"... */
export function fmtRelative(target: number, now: number): string {
  const c = countdown(target, now);
  const text = c.days >= 1 ? `${c.days} day${c.days === 1 ? "" : "s"}` : c.hours >= 1 ? `${c.hours} h` : `${Math.max(1, c.minutes)} min`;
  return c.past ? `${text} ago` : `in ${text}`;
}

/** Due-date label: "Due today, 5:00 PM", "Due tomorrow", "Overdue by 2 days"... */
export function fmtDue(dueMs: number, now: number): string {
  if (dueMs < now) return `Overdue by ${fmtRelative(dueMs, now).replace(" ago", "")}`;
  const dayDiff = Math.round((startOfDay(dueMs) - startOfDay(now)) / DAY);
  if (dayDiff === 0) return `Due today, ${fmtTime(dueMs)}`;
  if (dayDiff === 1) return `Due tomorrow, ${fmtTime(dueMs)}`;
  if (dayDiff < 7) return `Due ${fmtDate(dueMs)}, ${fmtTime(dueMs)}`;
  return `Due ${fmtDate(dueMs)}`;
}

/** Value for <input type="datetime-local"> */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Value for <input type="date"> */
export function toDateInput(ms: number): string {
  return toLocalInput(ms).slice(0, 10);
}

export function fromLocalInput(value: string): number {
  return new Date(value).getTime();
}

/** Combines a date input ("2026-11-20") and a time input ("08:00") into epoch ms. */
export function fromDateAndTime(date: string, time: string): number {
  return new Date(`${date}T${time}`).getTime();
}

export function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
