// Friendly pop-up messages after the planner changed your schedule.

import { toaster } from "@/components/ui/toaster";
import type { PlanSummary } from "@/context/PlannerContext";
import { fmtDuration, fmtTime } from "@/lib/format";

export function toastPlan(plan: PlanSummary | null, success = "Schedule updated") {
  if (!plan) return;

  const stretchText = plan.stretch
    ? `Tight schedule: ${[
        plan.stretch.relaxMin ? `${fmtDuration(plan.stretch.relaxMin)} of relax time` : "",
        plan.stretch.lateMin
          ? `${fmtDuration(plan.stretch.lateMin)} after bed time (until ${plan.stretch.latestEnd ? fmtTime(plan.stretch.latestEnd) : "late"})`
          : "",
      ]
        .filter(Boolean)
        .join(" and ")} used.`
    : "";

  if (plan.short.length > 0) {
    const list = plan.short.map((s) => `${s.task.title} (${fmtDuration(s.missingMin)} short)`).join(", ");
    toaster.create({
      type: "warning",
      title: "Some work does not fit before its deadline",
      description: `${list}. ${stretchText} Move the deadline, shorten the estimate, or free up some time.`.replace("  ", " "),
      duration: 15000,
    });
    return;
  }

  if (plan.stretch) {
    toaster.create({
      type: "warning",
      title: "It fits, but your rest time is used",
      description: `${stretchText} Check the Exams page to adjust.`,
      duration: 15000,
    });
    return;
  }

  const parts: string[] = [];
  if (plan.moved > 0) parts.push(`${plan.moved} missed session${plan.moved === 1 ? "" : "s"} moved`);
  parts.push(`${plan.placed} session${plan.placed === 1 ? "" : "s"} placed in your free time`);
  toaster.create({ type: "success", title: success, description: parts.join(", ") + "." });
}
