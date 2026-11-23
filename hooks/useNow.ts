"use client";

import { useEffect, useState } from "react";

/** The current time as a number, refreshed every `intervalMs` so "due in 2 h" stays correct. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
