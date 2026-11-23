// Your starting daily routine and planner preferences.
// Everything here can be changed later in the app (Settings page), so these are just the
// first values a new account gets. Prayer times are approximate for Selangor — use the
// "Sync prayer times" button in Settings to load the official JAKIM times.

import type { RoutineItem, Settings, Weekday } from "@/lib/types";

const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const NOT_FRIDAY: Weekday[] = [0, 1, 2, 3, 4, 6];
const WEEKEND: Weekday[] = [0, 6];

export const defaultRoutine: RoutineItem[] = [
  { id: "subuh", label: "Subuh", kind: "prayer", start: "05:50", end: "06:10", days: EVERY_DAY },
  { id: "bath-am", label: "Bath", kind: "bath", start: "06:10", end: "06:30", days: EVERY_DAY },
  { id: "breakfast", label: "Breakfast", kind: "meal", start: "06:30", end: "07:00", days: EVERY_DAY },
  { id: "lunch", label: "Lunch", kind: "meal", start: "12:45", end: "13:15", days: NOT_FRIDAY },
  { id: "zohor", label: "Zohor", kind: "prayer", start: "13:15", end: "13:35", days: NOT_FRIDAY },
  { id: "jumaat", label: "Solat Jumaat", kind: "prayer", start: "12:45", end: "14:00", days: [5] },
  { id: "lunch-fri", label: "Lunch", kind: "meal", start: "14:00", end: "14:30", days: [5] },
  { id: "asar", label: "Asar", kind: "prayer", start: "16:35", end: "16:55", days: EVERY_DAY },
  { id: "bath-pm", label: "Bath", kind: "bath", start: "17:00", end: "17:20", days: EVERY_DAY },
  { id: "maghrib", label: "Maghrib", kind: "prayer", start: "19:20", end: "19:40", days: EVERY_DAY },
  { id: "dinner", label: "Dinner", kind: "meal", start: "19:40", end: "20:15", days: EVERY_DAY },
  { id: "isyak", label: "Isyak", kind: "prayer", start: "20:30", end: "20:50", days: EVERY_DAY },
  { id: "relax", label: "Relax", kind: "relax", start: "21:00", end: "22:00", days: EVERY_DAY },
  { id: "relax-weekend", label: "Weekend relax", kind: "relax", start: "14:30", end: "16:30", days: WEEKEND },
];

export function defaultSettings(timezone = "Asia/Kuala_Lumpur"): Settings {
  return {
    timezone,
    wake: "05:45",
    bed: "23:00",
    routine: defaultRoutine.map((r) => ({ ...r, days: [...r.days] })),
    scheduling: {
      strategy: "balanced",
      sessionMin: 60,
      maxSessionMin: 90,
      minSessionMin: 25,
      breakMin: 10,
      classBufferMin: 10,
      maxDailyStudyMin: 240,
    },
    pomodoro: {
      focusMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      cyclesBeforeLong: 4,
    },
    notifications: {
      enabled: false,
      classLeadMin: 15,
      sessionLeadMin: 10,
      dueAlerts: true,
      digest: true,
      digestHour: 7,
    },
    prayer: {
      city: "Bangi",
      country: "Malaysia",
    },
  };
}
