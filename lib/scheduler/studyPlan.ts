// Turns an exam into a set of study tasks that the auto-scheduler can then place.
//
// Example: quiz in 2 days, chapters [Ch1 60m, Ch2 45m, Ch3 60m, Ch4 30m], 30m final recap
//   → "Study: Math – Ch1" (60m)  ... "Study: Math – Final recap" (30m)
// Every task gets a soft target (spread over the available time, in proportion to its length)
// and a HARD limit (a little before the exam starts) – nothing is ever planned after that.

import type { Chapter, Exam, Priority, Subject, Task } from "../types";
import { DAY, MIN, atTime, startOfDay } from "./time";

export type StudyTaskDraft = Omit<Task, "id">;

/** Minutes kept free between the end of studying and the start of the exam. */
export const EXAM_GAP_MIN = 60;

/** The chapters of an exam (older exams only have a list of topic names and a total time). */
export function examChapters(exam: Pick<Exam, "chapters" | "topics" | "prepMin" | "recapMin">): { chapters: Chapter[]; recapMin: number } {
  if (exam.chapters && exam.chapters.length > 0) {
    return {
      chapters: exam.chapters.filter((c) => c.name.trim() && c.minutes > 0),
      recapMin: Math.max(0, exam.recapMin || 0),
    };
  }
  // Legacy: split the total time over the topics, keeping ~20% for a recap when there is room.
  const topics = (exam.topics || []).map((t) => t.trim()).filter(Boolean);
  const prep = Math.max(30, exam.prepMin);
  const useRecap = prep >= 180 && topics.length > 0;
  const recap = useRecap ? Math.max(30, Math.round((prep * 0.2) / 15) * 15) : 0;
  const parts = topics.length > 0 ? topics : ["Revision"];
  const per = Math.max(15, Math.round((prep - recap) / parts.length / 5) * 5);
  return { chapters: parts.map((name, i) => ({ id: `t${i}`, name, minutes: per })), recapMin: recap };
}

/** Last moment studying may be planned: a bit before the exam starts. */
export function examHardLimit(examStart: number, now: number): number {
  let hard = examStart - EXAM_GAP_MIN * MIN;
  if (hard < now + 30 * MIN) hard = examStart - 10 * MIN; // exam is very close
  return hard;
}

export function buildStudyTasks(exam: Exam, subject: Subject | null | undefined, now: number): StudyTaskDraft[] {
  const examStart = Date.parse(exam.startsAt);
  if (!(examStart > now)) return [];

  const name = subject?.name || exam.title;
  const { chapters, recapMin } = examChapters(exam);
  const items = chapters.map((c) => ({ label: c.name.trim(), minutes: c.minutes }));
  if (recapMin > 0) items.push({ label: "Final recap", minutes: recapMin });
  if (items.length === 0) return [];

  const hard = examHardLimit(examStart, now);
  if (hard <= now + 5 * MIN) return [];

  const startFrom = exam.startFrom ? Date.parse(exam.startFrom) : 0;
  const begin = Math.max(now, startFrom);

  // When should the plan ideally be finished? (your "finish by", else 22:00 the evening before)
  const userFinish = exam.finishBy ? Date.parse(exam.finishBy) : 0;
  const allowOvertime = exam.allowOvertime !== false;
  let softEnd = userFinish > 0 ? userFinish : atTime(startOfDay(examStart - DAY), "22:00");
  // With "no overtime", the finish-by time is a hard promise too.
  const limit = userFinish > 0 && !allowOvertime ? Math.min(hard, Math.max(userFinish, now + 30 * MIN)) : hard;
  softEnd = Math.min(softEnd, limit);
  if (softEnd < begin + 30 * MIN) softEnd = limit;

  const span = Math.max(30 * MIN, softEnd - begin);
  const totalMin = items.reduce((a, i) => a + i.minutes, 0) || 1;
  const daysToExam = (examStart - now) / DAY;
  const priority: Priority = daysToExam <= 7 ? "high" : daysToExam <= 21 ? "medium" : "low";

  let acc = 0;
  return items.map((item, i) => {
    acc += item.minutes;
    let due = begin + span * (acc / totalMin);
    // tidy deadlines (9pm that day) when there are several days to play with
    if (span >= 3 * DAY) {
      const evening = atTime(startOfDay(due), "21:00");
      if (evening > begin && evening <= softEnd) due = evening;
    }
    if (i === items.length - 1) due = softEnd;
    due = Math.min(due, limit);
    const draft: StudyTaskDraft = {
      title: `Study: ${name} – ${item.label}`,
      subjectId: exam.subjectId,
      kind: "study",
      dueAt: new Date(due).toISOString(),
      hardDueAt: new Date(limit).toISOString(),
      startAfter: startFrom > now ? new Date(startFrom).toISOString() : null,
      window: exam.window || null,
      allowOvertime,
      estimateMin: item.minutes,
      loggedMin: 0,
      priority,
      status: "todo",
      notes: `Part of your plan for "${exam.title}".`,
      examId: exam.id,
      createdAt: new Date(now).toISOString(),
      completedAt: null,
    };
    return draft;
  });
}

/** Sum of the minutes the plan needs (chapters + recap). */
export function examTotalMin(exam: Pick<Exam, "chapters" | "topics" | "prepMin" | "recapMin">): number {
  const { chapters, recapMin } = examChapters(exam);
  return chapters.reduce((a, c) => a + c.minutes, 0) + recapMin;
}
