// All the data shapes used by the planner live here.
// Dates/times are stored as ISO strings (UTC) in Firestore; "HH:mm" strings are used
// for things that repeat every week (classes, routine, study slots).

export type HHMM = string; // "08:30"
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday ... 6 = Saturday

export type SubjectColor =
  | "teal"
  | "blue"
  | "purple"
  | "pink"
  | "orange"
  | "green"
  | "red"
  | "cyan"
  | "yellow";

/** A weekly time that is kept for one subject, e.g. "Math homework: Wednesday 08:00-09:00". */
export type StudySlot = { day: Weekday; start: HHMM; end: HHMM };

export type Subject = {
  id: string;
  name: string;
  code?: string;
  color: SubjectColor;
  studySlots: StudySlot[];
};

export type ClassKind = "lecture" | "tutorial" | "lab" | "other";

export type ClassSession = {
  id: string;
  subjectId: string;
  day: Weekday;
  start: HHMM;
  end: HHMM;
  room?: string;
  kind: ClassKind;
};

export type TaskKind = "assignment" | "study" | "quiz" | "project" | "other";
export type Priority = "low" | "medium" | "high";

export type Task = {
  id: string;
  title: string;
  subjectId: string | null;
  kind: TaskKind;
  /** ISO date-time the work is due. */
  dueAt: string;
  /** Your estimate of the TOTAL time needed, in minutes. */
  estimateMin: number;
  /** Minutes you worked on it with the focus timer (outside planned sessions). */
  loggedMin: number;
  priority: Priority;
  status: "todo" | "done";
  notes?: string;
  /** Set when the task was created by an exam study plan. */
  examId?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

/** One planned work session for a task. */
export type Block = {
  id: string;
  taskId: string;
  start: string; // ISO
  end: string; // ISO
  status: "planned" | "done";
  /** Locked = you picked this time yourself, so auto-scheduling never moves it. */
  locked: boolean;
};

export type Exam = {
  id: string;
  subjectId: string | null;
  title: string;
  startsAt: string; // ISO
  durationMin: number;
  venue?: string;
  topics: string[];
  /** Total study time you think you need, in minutes. */
  prepMin: number;
};

export type RoutineKind = "prayer" | "meal" | "bath" | "relax" | "other";

/** Something that happens in your day and must NOT be used for studying. */
export type RoutineItem = {
  id: string;
  label: string;
  kind: RoutineKind;
  start: HHMM;
  end: HHMM;
  days: Weekday[];
};

export type Strategy = "balanced" | "early";

export type Settings = {
  timezone: string;
  /** Start of your day. Nothing is planned before this. */
  wake: HHMM;
  /** Bed time. Nothing is planned after this. May be after midnight (e.g. 00:30). */
  bed: HHMM;
  routine: RoutineItem[];
  scheduling: {
    strategy: Strategy;
    /** Preferred length of one work session. */
    sessionMin: number;
    /** Longest single session. */
    maxSessionMin: number;
    /** Shortest session the planner will create when it has to split work. */
    minSessionMin: number;
    /** Gap after every session. */
    breakMin: number;
    /** Gap kept before and after each class (travel, setting up). */
    classBufferMin: number;
    /** Most study time planned in a single day. */
    maxDailyStudyMin: number;
  };
  pomodoro: {
    focusMin: number;
    shortBreakMin: number;
    longBreakMin: number;
    cyclesBeforeLong: number;
  };
  notifications: {
    enabled: boolean;
    classLeadMin: number;
    sessionLeadMin: number;
    dueAlerts: boolean;
    digest: boolean;
    digestHour: number; // 0-23, local time
  };
  prayer: {
    city: string;
    country: string;
  };
};

export type FocusLog = {
  id: string;
  taskId: string | null;
  blockId: string | null;
  minutes: number;
  at: string; // ISO
};

export type DayItemKind = "class" | "routine" | "study";

/** One row in a day's agenda (see lib/agenda.ts). */
export type DayItem = {
  id: string;
  kind: DayItemKind;
  title: string;
  subtitle?: string;
  start: number; // epoch ms
  end: number; // epoch ms
  subjectId?: string | null;
  routineKind?: RoutineKind;
  taskId?: string;
  blockId?: string;
  done?: boolean;
  missed?: boolean;
  locked?: boolean;
};
