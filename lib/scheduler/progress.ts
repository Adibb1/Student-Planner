// Helpers that answer "how much work is left?" and "what did I miss?".
//
// How progress is counted:
//   task.loggedMin is the single total of everything you worked on the task: focus rounds,
//   breaks (optional), sessions you ticked as done, and manual edits.
//   Sessions ticked as done in the first version of the app have no `creditedMin`; they are
//   still counted here so old data keeps working.

import type { Block, Task } from "../types";
import { MIN } from "./time";

export function blockMinutes(b: Pick<Block, "start" | "end">): number {
  return Math.round((Date.parse(b.end) - Date.parse(b.start)) / MIN);
}

/** Minutes from sessions ticked "done" by the first version of the app (they carry no creditedMin). */
export function legacyDoneMinutes(taskId: string, blocks: Block[]): number {
  return blocks
    .filter((b) => b.taskId === taskId && b.status === "done" && b.creditedMin === undefined)
    .reduce((sum, b) => sum + blockMinutes(b), 0);
}

/** Everything you have worked on the task so far. */
export function workedMinutes(task: Task, blocks: Block[]): number {
  return (task.loggedMin || 0) + legacyDoneMinutes(task.id, blocks);
}

/** Minutes of the estimate that are still not worked on. */
export function remainingMinutes(task: Task, blocks: Block[]): number {
  return Math.max(0, task.estimateMin - workedMinutes(task, blocks));
}

/** Minutes of planned sessions that are still ahead (time already worked inside a session is not counted). */
export function plannedMinutes(taskId: string, blocks: Block[]): number {
  return blocks
    .filter((b) => b.taskId === taskId && b.status === "planned")
    .reduce((sum, b) => {
      const len = blockMinutes(b);
      return sum + Math.max(0, len - Math.min(b.focusedMin || 0, len));
    }, 0);
}

export function progressPercent(task: Task, blocks: Block[]): number {
  if (task.status === "done") return 100;
  if (task.estimateMin <= 0) return 0;
  const done = task.estimateMin - remainingMinutes(task, blocks);
  return Math.min(100, Math.round((done / task.estimateMin) * 100));
}

/** A planned session whose time has already passed without being finished. */
export function isMissed(block: Block, now: number): boolean {
  return block.status === "planned" && Date.parse(block.end) < now;
}

export function isOverdue(task: Task, now: number): boolean {
  return task.status === "todo" && Date.parse(task.dueAt) < now;
}
