// Reading and writing times like "12", "45m", "1h30", "1.5h" or "1:30".

/** Turns what you typed into minutes, or null when it cannot be understood. */
export function parseDuration(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/,/g, ".");
  if (!s) return null;

  // 1:30  →  1 h 30 min
  let m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]) || null;

  // 45  →  45 minutes
  m = /^(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return Math.round(Number(m[1])) || null;

  // 1h, 1.5h, 45m, 1h30, 1h 30m, 2 hours 15 minutes
  m = /^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)?)?$/.exec(s);
  if (m && (m[1] || m[2])) {
    const total = Math.round(Number(m[1] || 0) * 60 + Number(m[2] || 0));
    return total > 0 ? total : null;
  }
  return null;
}

/** 75 → "1h 15m" (the same style you can type back in). */
export function formatDurationShort(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}
