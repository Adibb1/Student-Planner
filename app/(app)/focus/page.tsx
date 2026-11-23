"use client";

import { Badge, Box, Button, ButtonGroup, Card, HStack, Progress, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";
import { LuCheck, LuPause, LuPlay, LuSquare } from "react-icons/lu";
import { LoadingScreen, PageContainer, PageHeader, SectionCard, StatCard, SubjectBadge } from "@/components/Shared";
import { Select } from "@/components/ui/Select";
import { type FocusMode, formatClock, modeLabel, useFocus } from "@/context/FocusContext";
import { usePlanner } from "@/context/PlannerContext";
import { fmtDuration, fmtTime } from "@/lib/format";
import { plannedMinutes, progressPercent, remainingMinutes, startOfDay } from "@/lib/scheduler";

function FocusContent() {
  const { loading, now, settings, tasks, blocks, focusLogs, getSubject, getTask, toggleBlockDone } = usePlanner();
  const f = useFocus();
  const params = useSearchParams();
  const cfg = settings.pomodoro;

  // Opening "/focus?task=...&block=..." (from a task or a planned session) picks that task.
  const paramTask = params.get("task");
  const paramBlock = params.get("block");
  const { setTarget } = f;
  useEffect(() => {
    if (!loading && paramTask) setTarget(paramTask, paramBlock || "");
  }, [loading, paramTask, paramBlock, setTarget]);

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status === "todo").sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)),
    [tasks],
  );

  const stats = useMemo(() => {
    const day = startOfDay(now);
    const week = day - 6 * 86_400_000;
    const focusOnly = focusLogs.filter((l) => l.kind !== "break");
    return {
      today: focusOnly.filter((l) => Date.parse(l.at) >= day).reduce((s, l) => s + l.minutes, 0),
      week: focusOnly.filter((l) => Date.parse(l.at) >= week).reduce((s, l) => s + l.minutes, 0),
      sessions: focusOnly.filter((l) => Date.parse(l.at) >= day).length,
    };
  }, [focusLogs, now]);

  if (loading) return <LoadingScreen />;

  const task = getTask(f.taskId);
  const block = blocks.find((b) => b.id === f.blockId && b.taskId === f.taskId);
  const progress = f.totalMs > 0 ? Math.min(100, (f.elapsedMs / f.totalMs) * 100) : 0;
  const color = f.mode === "focus" ? "teal" : "green";
  const left = task ? remainingMinutes(task, blocks) : 0;
  const recent = focusLogs.slice(0, 6);
  const finished = f.justFinished;
  const finishedBlock = finished ? blocks.find((b) => b.id === finished.blockId) : undefined;

  return (
    <PageContainer>
      <PageHeader
        title="Focus"
        subtitle="Work in short, focused rounds with breaks in between. The timer keeps running when you open other pages, and the time you work is saved to your task as you go."
      />

      <SimpleGrid columns={{ base: 1, lg: 5 }} gap={6} alignItems="start">
        <Box gridColumn={{ lg: "span 3" }}>
          <Card.Root variant="outline" colorPalette={color}>
            <Card.Body gap={6} alignItems="center" py={{ base: 8, md: 12 }}>
              <ButtonGroup size="sm" attached>
                {(["focus", "short", "long"] as FocusMode[]).map((m) => (
                  <Button key={m} variant={f.mode === m ? "subtle" : "outline"} colorPalette={f.mode === m ? color : undefined} onClick={() => f.switchMode(m)}>
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
                {formatClock(f.remainingMs)}
              </Text>

              <Progress.Root value={progress} w="full" maxW="md" size="sm" colorPalette={color}>
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>

              <HStack gap={3} wrap="wrap" justify="center">
                {f.running ? (
                  <Button size="lg" colorPalette={color} onClick={f.pause}>
                    <LuPause /> Pause
                  </Button>
                ) : (
                  <Button size="lg" colorPalette={color} onClick={f.start}>
                    <LuPlay /> {f.active ? "Resume" : "Start"}
                  </Button>
                )}
                {f.active && (
                  <Button size="lg" variant="outline" onClick={f.stop}>
                    <LuSquare /> Stop
                  </Button>
                )}
              </HStack>
              {f.active && (
                <Text fontSize="xs" color="fg.muted" textAlign="center">
                  Pause or Stop saves the time you already worked. You can also leave this page: the timer keeps going.
                </Text>
              )}

              <HStack gap={2}>
                {Array.from({ length: cfg.cyclesBeforeLong }).map((_, i) => (
                  <Box key={i} boxSize="3" rounded="full" bg={i < f.cycles % cfg.cyclesBeforeLong ? "teal.500" : "bg.emphasized"} />
                ))}
                <Text fontSize="sm" color="fg.muted">
                  {f.cycles} round{f.cycles === 1 ? "" : "s"} done
                </Text>
              </HStack>

              {finished && finishedBlock && finishedBlock.status === "planned" && (
                <HStack gap={3} p={3} rounded="lg" bg="teal.subtle" wrap="wrap" justify="center">
                  <Text fontSize="sm">Is the planned session finished?</Text>
                  <Button
                    size="xs"
                    colorPalette="teal"
                    onClick={() => {
                      toggleBlockDone(finishedBlock.id);
                      f.dismissFinished();
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
              value={task && task.status === "todo" ? f.taskId : ""}
              onChange={(v) => f.setTarget(v, "")}
              placeholder="No task (just focus)"
              options={openTasks.map((t) => ({ value: t.id, label: t.title }))}
            />
            {task && task.status === "todo" && (
              <Stack gap={2}>
                <HStack gap={2} wrap="wrap">
                  <SubjectBadge subject={getSubject(task.subjectId)} />
                  <Text fontSize="sm" color="fg.muted">
                    {fmtDuration(left)} left · {fmtDuration(Math.max(0, left - plannedMinutes(task.id, blocks)))} not planned
                  </Text>
                </HStack>
                <Progress.Root value={progressPercent(task, blocks)} size="sm" colorPalette="teal">
                  <Progress.Track>
                    <Progress.Range />
                  </Progress.Track>
                </Progress.Root>
                {block && (
                  <Badge colorPalette="teal" variant="subtle" w="fit-content">
                    Planned session {fmtTime(Date.parse(block.start))} – {fmtTime(Date.parse(block.end))}
                  </Badge>
                )}
                <Text fontSize="xs" color="fg.muted">
                  {cfg.countBreaks ? "Focus time and breaks both count toward this task." : "Only focus time counts toward this task."}
                </Text>
              </Stack>
            )}
            {!f.taskId && (
              <Text fontSize="xs" color="fg.muted">
                Choose a task so your time is added to its progress bar.
              </Text>
            )}
          </SectionCard>

          <SimpleGrid columns={2} gap={4}>
            <StatCard label="Focused today" value={fmtDuration(stats.today)} hint={`${stats.sessions} round${stats.sessions === 1 ? "" : "s"}`} />
            <StatCard label="Last 7 days" value={fmtDuration(stats.week)} color="blue" />
          </SimpleGrid>

          {recent.length > 0 && (
            <SectionCard title="Recent focus">
              <Stack gap={2}>
                {recent.map((l) => (
                  <HStack key={l.id} justify="space-between" gap={3}>
                    <Text fontSize="sm" truncate>
                      {l.kind === "break" ? "Break" : getTask(l.taskId)?.title || "Free focus"}
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
