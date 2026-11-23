// One-click "I missed some sessions" recovery.

import { type PlanInput, type PlanMode, type PlanResult, planSchedule } from "./autoSchedule";
import { isMissed } from "./progress";

export type RescheduleResult = PlanResult & {
  /** How many missed sessions were moved. */
  movedCount: number;
  /** Which strategy ended up being used. */
  usedMode: PlanMode;
};

const shortfall = (r: PlanResult) => r.unscheduled.reduce((sum, u) => sum + u.missingMin, 0);

/**
 * First tries a gentle fix (only the missed work is placed into free time, everything else stays).
 * If that cannot fit everything, it tries a full re-plan and uses it when it fits more work.
 */
export function rescheduleMissed(input: Omit<PlanInput, "mode">): RescheduleResult {
  const todoIds = new Set(input.tasks.filter((t) => t.status === "todo").map((t) => t.id));
  const movedCount = input.blocks.filter((b) => isMissed(b, input.now) && todoIds.has(b.taskId)).length;

  const gentle = planSchedule({ ...input, mode: "incremental" });
  if (gentle.unscheduled.length === 0) return { ...gentle, movedCount, usedMode: "incremental" };

  const full = planSchedule({ ...input, mode: "full" });
  if (shortfall(full) < shortfall(gentle)) return { ...full, movedCount, usedMode: "full" };
  return { ...gentle, movedCount, usedMode: "incremental" };
}
