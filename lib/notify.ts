// Friendly pop-up messages after the planner changed your schedule.

import { toaster } from "@/components/ui/toaster";
import type { PlanSummary } from "@/context/PlannerContext";
import { fmtDuration } from "@/lib/format";

export function toastPlan(plan: PlanSummary | null, success = "Schedule updated") {
  if (!plan) return;

  if (plan.short.length > 0) {
    const list = plan.short.map((s) => `${s.task.title} (${fmtDuration(s.missingMin)} short)`).join(", ");
    toaster.create({
      type: "warning",
      title: "Some work does not fit before its deadline",
      description: `${list}. Move the deadline, shorten the estimate, or free up some time.`,
      duration: 12000,
    });
    return;
  }

  const parts: string[] = [];
  if (plan.moved > 0) parts.push(`${plan.moved} missed session${plan.moved === 1 ? "" : "s"} moved`);
  parts.push(`${plan.placed} session${plan.placed === 1 ? "" : "s"} placed in your free time`);
  toaster.create({ type: "success", title: success, description: parts.join(", ") + "." });
}
