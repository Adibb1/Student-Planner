// Loads today's prayer times from the free Aladhan service (no sign-up needed) and turns them
// into routine items. Nothing is sent about you except the city and country you type in Settings.

import type { RoutineItem, Weekday } from "@/lib/types";
import { toHHMM } from "@/lib/scheduler/time";

type Timings = Record<string, string>;

const EVERY_DAY: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const NOT_FRIDAY: Weekday[] = [0, 1, 2, 3, 4, 6];
const PRAYER_MIN = 20; // how long each prayer is blocked in your day

const toMinutes = (value: string): number => {
  const m = /(\d{1,2}):(\d{2})/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** Finds the id of the JAKIM (Malaysia) calculation method, falling back to the usual id 17. */
async function jakimMethodId(): Promise<number> {
  try {
    const res = await fetch("https://api.aladhan.com/v1/methods");
    const json = await res.json();
    const found = Object.values(json?.data || {}).find((m) => {
      const name = String((m as { name?: string }).name || "");
      return /jakim|malaysia/i.test(name);
    }) as { id?: number } | undefined;
    if (found?.id) return found.id;
  } catch {
    /* use the fallback below */
  }
  return 17;
}

export async function fetchPrayerTimings(city: string, country: string): Promise<Timings> {
  const method = await jakimMethodId();
  const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Prayer time service answered ${res.status}`);
  const json = await res.json();
  const timings = json?.data?.timings as Timings | undefined;
  if (!timings) throw new Error("No prayer times found for that city.");
  return timings;
}

/** Updates the prayer items in `routine` (adds them if missing) using the loaded timings. */
export function applyPrayerTimings(routine: RoutineItem[], t: Timings): RoutineItem[] {
  const fajr = toMinutes(t.Fajr);
  const dhuhr = toMinutes(t.Dhuhr);
  const asr = toMinutes(t.Asr);
  const maghrib = toMinutes(t.Maghrib);
  const isha = toMinutes(t.Isha);
  if ([fajr, dhuhr, asr, maghrib, isha].some((n) => Number.isNaN(n))) throw new Error("Unexpected prayer time format.");

  const wanted: RoutineItem[] = [
    { id: "subuh", label: "Subuh", kind: "prayer", start: toHHMM(fajr), end: toHHMM(fajr + PRAYER_MIN), days: EVERY_DAY },
    { id: "zohor", label: "Zohor", kind: "prayer", start: toHHMM(dhuhr), end: toHHMM(dhuhr + PRAYER_MIN), days: NOT_FRIDAY },
    { id: "jumaat", label: "Solat Jumaat", kind: "prayer", start: toHHMM(dhuhr - 30), end: toHHMM(dhuhr + 45), days: [5] },
    { id: "asar", label: "Asar", kind: "prayer", start: toHHMM(asr), end: toHHMM(asr + PRAYER_MIN), days: EVERY_DAY },
    { id: "maghrib", label: "Maghrib", kind: "prayer", start: toHHMM(maghrib), end: toHHMM(maghrib + PRAYER_MIN), days: EVERY_DAY },
    { id: "isyak", label: "Isyak", kind: "prayer", start: toHHMM(isha), end: toHHMM(isha + PRAYER_MIN), days: EVERY_DAY },
  ];

  const next = routine.map((r) => {
    const w = wanted.find((x) => x.id === r.id);
    return w ? { ...r, start: w.start, end: w.end } : r;
  });
  for (const w of wanted) if (!next.some((r) => r.id === w.id)) next.push(w);
  return next;
}
