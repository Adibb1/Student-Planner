// Helpers that answer "how much work is left?" and "what did I miss?".

import type { Block, Task } from "../types";
import { MIN } from "./time";

export function blockMinutes(b: Pick<Block, "start" | "end">): number {
  return Math.round((Date.parse(b.end) - Date.parse(b.start)) / MIN);
}

export function doneMinutes(taskId: string, blocks: Block[]): number {
  return blocks
    .filter((b) => b.taskId === taskId && b.status === "done")
    .reduce((sum, b) => sum + blockMinutes(b), 0);
}

/** Minutes of the estimate that are still not worked on. */
export function remainingMinutes(task: Task, blocks: Block[]): number {
  return Math.max(0, task.estimateMin - (task.loggedMin || 0) - doneMinutes(task.id, blocks));
}

/** Minutes of the remaining work that already have a planned (not done) session. */
export function plannedMinutes(taskId: string, blocks: Block[]): number {
  return blocks
    .filter((b) => b.taskId === taskId && b.status === "planned")
    .reduce((sum, b) => sum + blockMinutes(b), 0);
}

export function progressPercent(task: Task, blocks: Block[]): number {
  if (task.status === "done") return 100;
  if (task.estimateMin <= 0) return 0;
  const done = task.estimateMin - remainingMinutes(task, blocks);
  return Math.min(100, Math.round((done / task.estimateMin) * 100));
}

/** A planned session whose time has already passed without being ticked off. */
export function isMissed(block: Block, now: number): boolean {
  return block.status === "planned" && Date.parse(block.end) < now;
}

export function isOverdue(task: Task, now: number): boolean {
  return task.status === "todo" && Date.parse(task.dueAt) < now;
}
