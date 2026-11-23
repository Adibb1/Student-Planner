// Merges the settings saved in the database with the defaults, so a new setting added
// later never breaks an older account.

import { defaultSettings } from "@/config/defaults";
import type { Settings } from "@/lib/types";

type Stored = Partial<{
  [K in keyof Settings]: Settings[K] extends object ? Partial<Settings[K]> : Settings[K];
}>;

export function mergeSettings(stored: Stored | undefined | null, timezone?: string): Settings {
  const base = defaultSettings(timezone);
  if (!stored) return base;
  return {
    ...base,
    ...stored,
    routine: Array.isArray(stored.routine) ? (stored.routine as Settings["routine"]) : base.routine,
    scheduling: { ...base.scheduling, ...(stored.scheduling || {}) },
    pomodoro: { ...base.pomodoro, ...(stored.pomodoro || {}) },
    notifications: { ...base.notifications, ...(stored.notifications || {}) },
    prayer: { ...base.prayer, ...(stored.prayer || {}) },
  } as Settings;
}
