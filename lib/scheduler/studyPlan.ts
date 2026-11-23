// Turns an exam into a set of study tasks that the auto-scheduler can then place.
//
// Example: exam in 12 days, 6 hours of prep, topics [Algebra, Calculus, Statistics]
//   → "Study: Math – Algebra" (due in ~4 days, 1h 30m)
//   → "Study: Math – Calculus" (due in ~8 days, 1h 30m)
//   → "Study: Math – Statistics" (due in ~11 days, 1h 30m)
//   → "Study: Math – Past papers & recap" (due the day before the exam, 1h 30m)

import type { Exam, Priority, Subject, Task } from "../types";
import { DAY, HOUR, atTime, startOfDay } from "./time";

export type StudyTaskDraft = Omit<Task, "id">;

export function buildStudyTasks(exam: Exam, subject: Subject | null | undefined, now: number): StudyTaskDraft[] {
  const examStart = Date.parse(exam.startsAt);
  if (!(examStart > now)) return [];

  const name = subject?.name || exam.title;
  const topics = exam.topics.map((t) => t.trim()).filter(Boolean);
  const prep = Math.max(30, exam.prepMin);

  // Keep ~20% of the time for past papers / recap when there is enough time and topics.
  const useRecap = prep >= 180 && topics.length > 0;
  const recapMin = useRecap ? Math.max(30, Math.round((prep * 0.2) / 15) * 15) : 0;
  const topicBudget = prep - recapMin;

  const parts = topics.length > 0 ? topics : ["Revision"];
  const perTopic = Math.max(30, Math.round(topicBudget / parts.length / 15) * 15);

  const items = parts.map((p) => ({ label: p, minutes: perTopic }));
  if (useRecap) items.push({ label: "Past papers & recap", minutes: recapMin });

  // Everything should be finished the evening before (or a little earlier if the exam is soon).
  let lastDue = atTime(startOfDay(examStart - DAY), "22:00");
  if (lastDue > examStart - 2 * HOUR) lastDue = examStart - 2 * HOUR;
  if (lastDue < now + HOUR) lastDue = Math.max(now + 30 * 60_000, examStart - 30 * 60_000);

  const days = (examStart - now) / DAY;
  const priority: Priority = days <= 7 ? "high" : days <= 21 ? "medium" : "low";

  return items.map((item, i) => {
    const fraction = (i + 1) / items.length;
    let due = now + (lastDue - now) * fraction;
    const evening = atTime(startOfDay(due), "21:00"); // tidy deadlines: 9pm of that day
    if (evening > now && evening <= lastDue) due = evening;
    if (i === items.length - 1) due = lastDue;
    return {
      title: `Study: ${name} – ${item.label}`,
      subjectId: exam.subjectId,
      kind: "study" as const,
      dueAt: new Date(due).toISOString(),
      estimateMin: item.minutes,
      loggedMin: 0,
      priority,
      status: "todo" as const,
      notes: `Part of your plan for "${exam.title}".`,
      examId: exam.id,
      createdAt: new Date(now).toISOString(),
      completedAt: null,
    };
  });
}
