// Names, menu items and labels used across the app.
// Change the text here and it updates everywhere (same idea as lib/data.ts in your portfolio).

import type {
  ClassKind,
  Priority,
  RoutineKind,
  SubjectColor,
  TaskKind,
} from "@/lib/types";

export const site = {
  name: "StudyFlow",
  shortName: "StudyFlow",
  tagline:
    "Your timetable, assignments and exams in one place. It plans your study sessions around classes, prayer, meals, bath, relax time and sleep.",
  description:
    "A personal student planner with auto-scheduling, reschedule-in-one-click and push reminders.",
  owner: "Adib",
  portfolioUrl: "https://adibb1.xyz",
  themeColor: "#14b8a6",
};

export const nav = [
  { label: "Today", href: "/dashboard" },
  { label: "Timetable", href: "/timetable" },
  { label: "Assignments", href: "/tasks" },
  { label: "Exams", href: "/exams" },
  { label: "Focus", href: "/focus" },
  { label: "Subjects", href: "/subjects" },
  { label: "Settings", href: "/settings" },
];

export const landingFeatures = [
  {
    title: "Weekly timetable",
    text: "Add your classes once. They show up every week, next to your meals, prayers and relax time.",
  },
  {
    title: "Auto-scheduling",
    text: "Tell it how long a task takes. It finds free time before the deadline and plans the sessions for you.",
  },
  {
    title: "Missed something?",
    text: "One tap moves every missed session into your next free time without breaking the rest of your week.",
  },
  {
    title: "Exam countdown",
    text: "Add an exam and the topics. A study plan is created and placed in your timetable.",
  },
  {
    title: "Pomodoro timer",
    text: "Focus on a task with a timer. Your minutes are counted toward the task automatically.",
  },
  {
    title: "Push reminders",
    text: "Get a notification before class, before a study session and before something is due.",
  },
];

export const subjectColors: SubjectColor[] = [
  "teal",
  "blue",
  "purple",
  "pink",
  "orange",
  "green",
  "red",
  "cyan",
  "yellow",
];

export const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const weekdayLong = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
/** The order days are shown in (Monday first). */
export const weekOrder = [1, 2, 3, 4, 5, 6, 0] as const;

export const classKinds: { value: ClassKind; label: string }[] = [
  { value: "lecture", label: "Lecture" },
  { value: "tutorial", label: "Tutorial" },
  { value: "lab", label: "Lab" },
  { value: "other", label: "Other" },
];

export const taskKinds: { value: TaskKind; label: string }[] = [
  { value: "assignment", label: "Assignment" },
  { value: "project", label: "Project" },
  { value: "quiz", label: "Quiz / test prep" },
  { value: "study", label: "Study session" },
  { value: "other", label: "Other" },
];

export const priorities: { value: Priority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "gray" },
  { value: "medium", label: "Medium", color: "orange" },
  { value: "high", label: "High", color: "red" },
];

export const routineKinds: {
  value: RoutineKind;
  label: string;
  color: string;
}[] = [
  { value: "prayer", label: "Prayer", color: "purple" },
  { value: "meal", label: "Meal", color: "orange" },
  { value: "bath", label: "Bath", color: "cyan" },
  { value: "relax", label: "Relax", color: "green" },
  { value: "other", label: "Other", color: "gray" },
];

/** Quick choices for "how long will it take?" */
export const estimateChips = [
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
  { label: "3 h", minutes: 180 },
  { label: "5 h", minutes: 300 },
  { label: "8 h", minutes: 480 },
];
