"use client";

// The focus timer lives here, at the top of the app, NOT inside the Focus page.
// That is why it keeps running when you open other pages, and why it survives a refresh:
//   • the timer is based on the clock (end time), so it is always correct
//   • its state is saved in this browser (localStorage)
//   • the minutes you worked are saved to your account every minute, and when you pause,
//     stop or finish, so partly finished rounds still count toward your progress.

import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toaster } from "@/components/ui/toaster";
import { usePlanner } from "@/context/PlannerContext";
import { MIN } from "@/lib/scheduler";

export type FocusMode = "focus" | "short" | "long";

type Saved = {
  v: 1;
  mode: FocusMode;
  running: boolean;
  endAt: number | null;
  /** Time left while paused or idle. */
  leftMs: number;
  /** Length of the current round. */
  totalMs: number;
  /** How much of this round has already been saved to your account. */
  loggedMs: number;
  runId: string;
  cycles: number;
  taskId: string;
  blockId: string;
};

type FocusState = {
  mode: FocusMode;
  running: boolean;
  remainingMs: number;
  totalMs: number;
  elapsedMs: number;
  cycles: number;
  taskId: string;
  blockId: string;
  /** A round is running, or paused part-way. */
  active: boolean;
  /** Set when a focus round has just ended (so the page can offer to tick the session). */
  justFinished: { taskId: string; blockId: string } | null;
  start: () => void;
  pause: () => void;
  stop: () => void;
  switchMode: (mode: FocusMode) => void;
  setTarget: (taskId: string, blockId?: string) => void;
  dismissFinished: () => void;
};

const FocusContext = createContext<FocusState | null>(null);

export const modeLabel: Record<FocusMode, string> = { focus: "Focus", short: "Short break", long: "Long break" };

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const newRunId = () => `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const remainingOf = (st: Saved, t: number) => (st.running && st.endAt ? Math.max(0, st.endAt - t) : st.leftMs);

function beep(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    ctx.resume();
    [0, 0.25, 0.5].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.2);
    });
  } catch {
    /* sound is optional */
  }
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const { uid, loading, settings, addProgress } = usePlanner();
  const cfg = settings.pomodoro;
  const storageKey = `studyflow:focus:${uid}`;

  const modeMs = useCallback(
    (m: FocusMode) => (m === "focus" ? cfg.focusMin : m === "short" ? cfg.shortBreakMin : cfg.longBreakMin) * MIN,
    [cfg.focusMin, cfg.shortBreakMin, cfg.longBreakMin],
  );

  // The timer's state is kept in a ref so timers and buttons always see the latest values.
  const store = useRef<Saved>({
    v: 1,
    mode: "focus",
    running: false,
    endAt: null,
    leftMs: cfg.focusMin * MIN,
    totalMs: cfg.focusMin * MIN,
    loggedMs: 0,
    runId: newRunId(),
    cycles: 0,
    taskId: "",
    blockId: "",
  });
  const [, bump] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [justFinished, setJustFinished] = useState<FocusState["justFinished"]>(null);

  const lastFlush = useRef(Date.now());
  const audio = useRef<AudioContext | null>(null);
  const restored = useRef(false);
  const baseTitle = useRef<string | null>(null);

  const latest = useRef({ cfg, modeMs, addProgress });
  latest.current = { cfg, modeMs, addProgress };

  const commit = useCallback(
    (patch: Partial<Saved>) => {
      store.current = { ...store.current, ...patch };
      try {
        localStorage.setItem(storageKey, JSON.stringify(store.current));
      } catch {
        /* private mode: the timer still works, it just will not survive a refresh */
      }
      bump((n) => n + 1);
    },
    [storageKey],
  );

  /** Saves the minutes worked since the last save. `final` also rounds the last seconds and tidies the plan. */
  const flush = useCallback(
    (final: boolean) => {
      const st = store.current;
      const t = Date.now();
      const delta = st.totalMs - remainingOf(st, t) - st.loggedMs;
      let whole = Math.max(0, Math.floor(delta / MIN));
      if (final && delta - whole * MIN >= 30_000) whole += 1;
      lastFlush.current = t;

      const { cfg: c, addProgress: add } = latest.current;
      const isFocus = st.mode === "focus";
      // A break is only saved when a task is chosen and breaks are set to count.
      const worthSaving = isFocus || (!!st.taskId && c.countBreaks);
      if (worthSaving && (whole >= 1 || (final && st.loggedMs > 0))) {
        add({
          runId: st.runId,
          taskId: st.taskId || null,
          blockId: st.blockId || null,
          minutes: whole,
          kind: isFocus ? "focus" : "break",
          creditTask: isFocus || c.countBreaks,
          settle: final,
        });
      }
      if (whole >= 1) commit({ loggedMs: st.loggedMs + whole * MIN });
    },
    [commit],
  );

  /** A round reached zero: save it, ring, and get the next round ready. */
  const finishRun = useCallback(() => {
    const st = store.current;
    flush(true);

    beep(audio.current);
    const wasFocus = st.mode === "focus";
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(wasFocus ? "Focus round finished" : "Break is over", {
          body: wasFocus ? "Time for a rest." : "Ready for the next focus round?",
          icon: "/icon-192.png",
        });
      }
    } catch {
      /* some phones do not allow this constructor */
    }
    toaster.create({
      type: "success",
      title: wasFocus ? "Focus round finished" : "Break is over",
      description: wasFocus ? "Your time was saved." : "Ready for the next focus round?",
    });

    const c = latest.current.cfg;
    let cycles = st.cycles;
    let next: FocusMode = "focus";
    if (wasFocus) {
      cycles += 1;
      next = cycles % c.cyclesBeforeLong === 0 ? "long" : "short";
      setJustFinished({ taskId: st.taskId, blockId: st.blockId });
    }
    const total = latest.current.modeMs(next);
    const t = Date.now();
    lastFlush.current = t;
    commit({
      mode: next,
      cycles,
      running: c.autoStart,
      endAt: c.autoStart ? t + total : null,
      leftMs: total,
      totalMs: total,
      loggedMs: 0,
      runId: newRunId(),
    });
  }, [flush, commit]);

  // Bring back a timer that was running before a refresh, once your data has loaded.
  useEffect(() => {
    if (loading || restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Saved;
      if (saved?.v !== 1 || typeof saved.totalMs !== "number") return;
      store.current = saved;
      bump((n) => n + 1);
      if (saved.running && saved.endAt && saved.endAt <= Date.now()) finishRun();
    } catch {
      /* ignore a damaged saved timer */
    }
  }, [loading, storageKey, finishRun]);

  // When the durations in Settings change (or finish loading), refresh an untouched clock.
  useEffect(() => {
    const st = store.current;
    if (st.running || st.leftMs !== st.totalMs || st.loggedMs > 0) return;
    const total = modeMs(st.mode);
    if (total !== st.totalMs) commit({ leftMs: total, totalMs: total });
  }, [modeMs, commit, loading]);

  // The clock tick. A tiny background worker is used so it is not slowed down in hidden tabs.
  const running = store.current.running;
  const endAt = store.current.endAt;
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const t = Date.now();
      setNow(t);
      const st = store.current;
      if (st.running && st.endAt && t >= st.endAt) {
        finishRun();
        return;
      }
      if (t - lastFlush.current >= 60_000) flush(false); // save progress every minute
    };

    let cleanup: () => void;
    try {
      const url = URL.createObjectURL(new Blob(["setInterval(function(){postMessage(1)},1000)"], { type: "text/javascript" }));
      const worker = new Worker(url);
      worker.onmessage = tick;
      cleanup = () => {
        worker.terminate();
        URL.revokeObjectURL(url);
      };
    } catch {
      const id = setInterval(tick, 1000);
      cleanup = () => clearInterval(id);
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      stopped = true;
      cleanup();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running, endAt, finishRun, flush]);

  // Show the time in the browser tab title so you can see it from another tab.
  const st = store.current;
  const remainingMs = remainingOf(st, now);
  useEffect(() => {
    if (st.running) {
      if (baseTitle.current === null) baseTitle.current = document.title;
      document.title = `${formatClock(remainingMs)} · ${modeLabel[st.mode]}`;
    } else if (baseTitle.current !== null) {
      document.title = baseTitle.current;
      baseTitle.current = null;
    }
  }, [st.running, st.mode, remainingMs]);

  // ── Buttons ──────────────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx && !audio.current) audio.current = new Ctx(); // created on a click, so sound is allowed later
      audio.current?.resume();
    } catch {
      /* sound is optional */
    }
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
    const cur = store.current;
    if (cur.running) return;
    const t = Date.now();
    lastFlush.current = t;
    setNow(t);
    setJustFinished(null);
    commit({ running: true, endAt: t + cur.leftMs });
  }, [commit]);

  const pause = useCallback(() => {
    if (!store.current.running) return;
    flush(true);
    const left = Math.max(0, (store.current.endAt ?? Date.now()) - Date.now());
    commit({ running: false, endAt: null, leftMs: left });
  }, [flush, commit]);

  const stop = useCallback(() => {
    flush(true);
    const total = latest.current.modeMs(store.current.mode);
    commit({ running: false, endAt: null, leftMs: total, totalMs: total, loggedMs: 0, runId: newRunId() });
  }, [flush, commit]);

  const switchMode = useCallback(
    (mode: FocusMode) => {
      flush(true);
      const total = latest.current.modeMs(mode);
      commit({ mode, running: false, endAt: null, leftMs: total, totalMs: total, loggedMs: 0, runId: newRunId() });
    },
    [flush, commit],
  );

  const setTarget = useCallback(
    (taskId: string, blockId = "") => {
      const cur = store.current;
      if (cur.taskId === taskId && cur.blockId === blockId) return;
      flush(true); // time so far belongs to the previous task
      const elapsed = store.current.totalMs - remainingOf(store.current, Date.now());
      commit({ taskId, blockId, loggedMs: elapsed, runId: newRunId() });
    },
    [flush, commit],
  );

  const dismissFinished = useCallback(() => setJustFinished(null), []);

  const value: FocusState = {
    mode: st.mode,
    running: st.running,
    remainingMs,
    totalMs: st.totalMs,
    elapsedMs: Math.max(0, st.totalMs - remainingMs),
    cycles: st.cycles,
    taskId: st.taskId,
    blockId: st.blockId,
    active: st.running || st.leftMs < st.totalMs,
    justFinished,
    start,
    pause,
    stop,
    switchMode,
    setTarget,
    dismissFinished,
  };

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(): FocusState {
  const ctx = useContext(FocusContext);
  if (!ctx) throw new Error("useFocus must be used inside <FocusProvider>");
  return ctx;
}
