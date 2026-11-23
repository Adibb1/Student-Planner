"use client";

import { Badge, Box, Button, ButtonGroup, Card, HStack, Progress, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuCheck, LuPause, LuPlay, LuRotateCcw, LuSkipForward, LuSquare } from "react-icons/lu";
import { LoadingScreen, PageContainer, PageHeader, SectionCard, StatCard, SubjectBadge } from "@/components/Shared";
import { Select } from "@/components/ui/Select";
import { toaster } from "@/components/ui/toaster";
import { usePlanner } from "@/context/PlannerContext";
import { fmtDuration, fmtTime } from "@/lib/format";
import { MIN, plannedMinutes, remainingMinutes, startOfDay } from "@/lib/scheduler";

type Mode = "focus" | "short" | "long";

const modeLabel: Record<Mode, string> = { focus: "Focus", short: "Short break", long: "Long break" };

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
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
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* sound is optional */
  }
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

function FocusContent() {
  const { loading, now, settings, tasks, blocks, focusLogs, getSubject, getTask, logFocus, toggleBlockDone } = usePlanner();
  const params = useSearchParams();
  const cfg = settings.pomodoro;

  const [taskId, setTaskId] = useState(params.get("task") || "");
  const [blockId, setBlockId] = useState(params.get("block") || "");
  const [mode, setMode] = useState<Mode>("focus");
  const [running, setRunning] = useState(false);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [leftMs, setLeftMs] = useState(cfg.focusMin * MIN); // time left while paused / idle
  const [tick, setTick] = useState(() => Date.now());
  const [cycles, setCycles] = useState(0);
  const [justFinished, setJustFinished] = useState(false);

  const modeMs = useCallback(
    (m: Mode) => (m === "focus" ? cfg.focusMin : m === "short" ? cfg.shortBreakMin : cfg.longBreakMin) * MIN,
    [cfg.focusMin, cfg.shortBreakMin, cfg.longBreakMin],
  );

  const remaining = running && endAt ? Math.max(0, endAt - tick) : leftMs;
  const total = modeMs(mode);
  const elapsedMs = total - remaining;

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status === "todo").sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)),
    [tasks],
  );
  const task = getTask(taskId);
  const block = blocks.find((b) => b.id === blockId && b.taskId === taskId);

  // When the durations in Settings change (or finish loading), refresh the idle clock.
  // This must NOT depend on `running`, or pausing would reset the time that is left.
  const runningRef = useRef(running);
  runningRef.current = running;
  useEffect(() => {
    if (!runningRef.current) setLeftMs(modeMs(mode));
  }, [mode, modeMs]);

  const switchMode = useCallback(
    (next: Mode) => {
      setMode(next);
      setRunning(false);
      setEndAt(null);
      setLeftMs(modeMs(next));
    },
    [modeMs],
  );

  // Finishing a block of time (or stopping early) saves the minutes you actually focused.
  const saveFocus = useCallback(
    (minutes: number) => {
      if (minutes < 1) return;
      logFocus({ taskId: taskId || null, blockId: block ? block.id : null, minutes });
    },
    [logFocus, taskId, block],
  );

  const complete = useCallback(() => {
    beep();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(mode === "focus" ? "Focus session finished" : "Break is over", {
        body: mode === "focus" ? "Time for a short rest." : "Ready for the next focus session?",
        icon: "/icon-192.png",
      });
    }
    if (mode === "focus") {
      saveFocus(cfg.focusMin);
      const done = cycles + 1;
      setCycles(done);
      setJustFinished(true);
      switchMode(done % cfg.cyclesBeforeLong === 0 ? "long" : "short");
    } else {
      switchMode("focus");
    }
  }, [mode, saveFocus, cfg.focusMin, cfg.cyclesBeforeLong, cycles, switchMode]);

  const completeRef = useRef(complete);
  completeRef.current = complete;

  useEffect(() => {
    if (!running || !endAt) return;
    const id = setInterval(() => {
      const t = Date.now();
      setTick(t);
      if (t >= endAt) completeRef.current();
    }, 250);
    return () => clearInterval(id);
  }, [running, endAt]);

  // Show the time in the browser tab so you can see it from another tab.
  useEffect(() => {
    document.title = running ? `${clock(remaining)} · ${modeLabel[mode]}` : "Focus | StudyFlow";
    return () => {
      document.title = "StudyFlow | Student Planner";
    };
  }, [running, remaining, mode]);

  const start = () => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
    const t = Date.now();
    setTick(t);
    setEndAt(t + leftMs);
    setRunning(true);
    setJustFinished(false);
  };

  const pause = () => {
    setLeftMs(Math.max(0, (endAt || Date.now()) - Date.now()));
    setRunning(false);
    setEndAt(null);
  };

  const reset = () => {
    setRunning(false);
    setEndAt(null);
    setLeftMs(modeMs(mode));
  };

  const stopEarly = () => {
    const minutes = Math.floor(elapsedMs / MIN);
    if (mode === "focus" && minutes >= 1) {
      saveFocus(minutes);
      toaster.create({ type: "success", title: `${minutes} min of focus saved` });
    }
    reset();
  };

  const stats = useMemo(() => {
    const day = startOfDay(now);
    const week = day - 6 * 86_400_000;
    return {
      today: focusLogs.filter((l) => Date.parse(l.at) >= day).reduce((s, l) => s + l.minutes, 0),
      week: focusLogs.filter((l) => Date.parse(l.at) >= week).reduce((s, l) => s + l.minutes, 0),
      sessions: focusLogs.filter((l) => Date.parse(l.at) >= day).length,
    };
  }, [focusLogs, now]);

  if (loading) return <LoadingScreen />;

  const progress = total > 0 ? Math.min(100, (elapsedMs / total) * 100) : 0;
  const color = mode === "focus" ? "teal" : "green";
  const left = task ? remainingMinutes(task, blocks) : 0;
  const recent = focusLogs.slice(0, 6);

  return (
    <PageContainer>
      <PageHeader
        title="Focus"
        subtitle="Work in short, focused rounds with breaks in between. Your minutes are counted toward the task you choose."
      />

      <SimpleGrid columns={{ base: 1, lg: 5 }} gap={6} alignItems="start">
        <Box gridColumn={{ lg: "span 3" }}>
          <Card.Root variant="outline" colorPalette={color}>
            <Card.Body gap={6} alignItems="center" py={{ base: 8, md: 12 }}>
              <ButtonGroup size="sm" attached>
                {(["focus", "short", "long"] as Mode[]).map((m) => (
                  <Button key={m} variant={mode === m ? "subtle" : "outline"} colorPalette={mode === m ? color : undefined} onClick={() => switchMode(m)}>
                    {modeLabel[m]}
                  </Button>
                ))}
              </ButtonGroup>

              <Text
                fontSize={{ base: "7xl", md: "8xl" }}
                fontWeight="bold"
                letterSpacing="-0.03em"
                lineHeight="1"
                fontVariantNumeric="tabular-nums"
                color="colorPalette.fg"
                role="timer"
                aria-live="off"
              >
                {clock(remaining)}
              </Text>

              <Progress.Root value={progress} w="full" maxW="md" size="sm" colorPalette={color}>
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>

              <HStack gap={3} wrap="wrap" justify="center">
                {running ? (
                  <Button size="lg" colorPalette={color} onClick={pause}>
                    <LuPause /> Pause
                  </Button>
                ) : (
                  <Button size="lg" colorPalette={color} onClick={start}>
                    <LuPlay /> {leftMs < total ? "Resume" : "Start"}
                  </Button>
                )}
                {mode === "focus" && elapsedMs >= MIN && (
                  <Button size="lg" variant="outline" onClick={stopEarly}>
                    <LuSquare /> Finish early
                  </Button>
                )}
                <Button size="lg" variant="ghost" onClick={reset} disabled={elapsedMs <= 0}>
                  <LuRotateCcw /> Reset
                </Button>
                {mode !== "focus" && (
                  <Button size="lg" variant="ghost" onClick={() => switchMode("focus")}>
                    <LuSkipForward /> Skip break
                  </Button>
                )}
              </HStack>

              <HStack gap={2}>
                {Array.from({ length: cfg.cyclesBeforeLong }).map((_, i) => (
                  <Box key={i} boxSize="3" rounded="full" bg={i < cycles % cfg.cyclesBeforeLong || (cycles > 0 && cycles % cfg.cyclesBeforeLong === 0 && mode === "long") ? "teal.500" : "bg.emphasized"} />
                ))}
                <Text fontSize="sm" color="fg.muted">
                  {cycles} round{cycles === 1 ? "" : "s"} done
                </Text>
              </HStack>

              {justFinished && block && block.status === "planned" && (
                <HStack gap={3} p={3} rounded="lg" bg="teal.subtle" wrap="wrap" justify="center">
                  <Text fontSize="sm">Is the planned session finished?</Text>
                  <Button
                    size="xs"
                    colorPalette="teal"
                    onClick={() => {
                      toggleBlockDone(block.id);
                      setJustFinished(false);
                    }}
                  >
                    <LuCheck /> Mark session done
                  </Button>
                </HStack>
              )}
            </Card.Body>
          </Card.Root>
        </Box>

        <Stack gap={6} gridColumn={{ lg: "span 2" }} minW={0}>
          <SectionCard title="What are you working on?">
            <Select
              value={taskId}
              onChange={(v) => {
                setTaskId(v);
                setBlockId("");
              }}
              placeholder="No task (just focus)"
              options={openTasks.map((t) => ({ value: t.id, label: t.title }))}
            />
            {task && (
              <Stack gap={2}>
                <HStack gap={2} wrap="wrap">
                  <SubjectBadge subject={getSubject(task.subjectId)} />
                  <Text fontSize="sm" color="fg.muted">
                    {fmtDuration(left)} left · {fmtDuration(Math.max(0, left - plannedMinutes(task.id, blocks)))} not planned
                  </Text>
                </HStack>
                {block && (
                  <Badge colorPalette="teal" variant="subtle" w="fit-content">
                    Planned session {fmtTime(Date.parse(block.start))} – {fmtTime(Date.parse(block.end))}
                  </Badge>
                )}
              </Stack>
            )}
          </SectionCard>

          <SimpleGrid columns={2} gap={4}>
            <StatCard label="Focused today" value={fmtDuration(stats.today)} hint={`${stats.sessions} session${stats.sessions === 1 ? "" : "s"}`} />
            <StatCard label="Last 7 days" value={fmtDuration(stats.week)} color="blue" />
          </SimpleGrid>

          {recent.length > 0 && (
            <SectionCard title="Recent focus">
              <Stack gap={2}>
                {recent.map((l) => (
                  <HStack key={l.id} justify="space-between" gap={3}>
                    <Text fontSize="sm" truncate>
                      {getTask(l.taskId)?.title || "Free focus"}
                    </Text>
                    <Text fontSize="sm" color="fg.muted" whiteSpace="nowrap">
                      {fmtDuration(l.minutes)} · {fmtTime(Date.parse(l.at))}
                    </Text>
                  </HStack>
                ))}
              </Stack>
            </SectionCard>
          )}
        </Stack>
      </SimpleGrid>
    </PageContainer>
  );
}

export default function FocusPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <FocusContent />
    </Suspense>
  );
}
