"use client";

import { useEffect } from "react";
import { toaster } from "@/components/ui/toaster";
import { listenForeground } from "@/lib/firebase/messaging";

/** Shows a pop-up when a push reminder arrives while the planner is open on screen. */
export function PushListener() {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    listenForeground((title, body) => {
      toaster.create({ title, description: body, type: "info", duration: 8000 });
    }).then((unsub) => {
      if (cancelled) unsub();
      else stop = unsub;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return null;
}
