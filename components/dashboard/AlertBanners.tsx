"use client";

import { Box, Button, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { type ReactNode, useMemo } from "react";
import { LuClock, LuFlame, LuMoon, LuRefreshCw, LuSparkles } from "react-icons/lu";
import { usePlanner } from "@/context/PlannerContext";
import { fmtTime } from "@/lib/format";
import { toastPlan } from "@/lib/notify";
import { plannedMinutes, remainingMinutes } from "@/lib/scheduler";

function Banner({
  color,
  icon,
  title,
  text,
  action,
}: {
  color: string;
  icon: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <Flex
      colorPalette={color}
      direction={{ base: "column", sm: "row" }}
      align={{ base: "flex-start", sm: "center" }}
      justify="space-between"
      gap={3}
      p={4}
      rounded="xl"
      bg="colorPalette.subtle"
      borderWidth="1px"
      borderColor="colorPalette.muted"
    >
      <HStack gap={3} align="flex-start">
        <Box color="colorPalette.fg" fontSize="xl" pt="2px">
          {icon}
        </Box>
        <Stack gap={0}>
          <Text fontWeight="semibold">{title}</Text>
          <Text fontSize="sm" color="fg.muted">
            {text}
          </Text>
        </Stack>
      </HStack>
      {action}
    </Flex>
  );
}

/** Things that need attention: missed sessions, overdue work, clashes, unplanned tasks. */
export function AlertBanners() {
  const { alerts, tasks, blocks, now, rescheduleMissedWork, autoSchedule } = usePlanner();

  const unplanned = useMemo(
    () =>
      tasks.filter(
        (t) => t.status === "todo" && remainingMinutes(t, blocks) - plannedMinutes(t.id, blocks) > 0,
      ),
    [tasks, blocks],
  );

  // Sessions the planner squeezed into relax time / late nights (still ahead of you).
  const stretched = useMemo(
    () =>
      blocks.filter(
        (b) => b.stretch && b.status === "planned" && Date.parse(b.end) > now && tasks.find((t) => t.id === b.taskId)?.status === "todo",
      ),
    [blocks, tasks, now],
  );
  const lateCount = stretched.filter((b) => b.stretch === "late").length;
  const latestEnd = stretched.reduce((m, b) => Math.max(m, Date.parse(b.end)), 0);

  const missed = alerts.missed.length;
  const clashes = alerts.clashes.length;
  const overdue = alerts.overdue.length;
  if (!missed && !clashes && !overdue && unplanned.length === 0 && stretched.length === 0) return null;

  return (
    <Stack gap={3} mb={6}>
      {stretched.length > 0 && (
        <Banner
          color="orange"
          icon={<LuMoon />}
          title="Tight schedule: study is squeezed into your rest time"
          text={`${stretched.length} session${stretched.length === 1 ? "" : "s"} use your relax time${
            lateCount > 0 ? ` or late nights (latest finish ${fmtTime(latestEnd)})` : ""
          }. Get enough sleep when you can.`}
          action={
            <Button asChild colorPalette="orange" size="sm" variant="outline">
              <NextLink href="/exams">Review exam plan</NextLink>
            </Button>
          }
        />
      )}
      {missed > 0 && (
        <Banner
          color="orange"
          icon={<LuClock />}
          title={`You missed ${missed} study session${missed === 1 ? "" : "s"}`}
          text="No stress. One tap moves them into your next free time."
          action={
            <Button
              colorPalette="orange"
              size="sm"
              onClick={() => toastPlan(rescheduleMissedWork(), "Missed sessions rescheduled")}
            >
              <LuRefreshCw /> Reschedule missed
            </Button>
          }
        />
      )}
      {clashes > 0 && (
        <Banner
          color="purple"
          icon={<LuRefreshCw />}
          title={`${clashes} session${clashes === 1 ? "" : "s"} now clash with your timetable`}
          text="Your classes or daily routine changed. Re-plan to fix the clashes."
          action={
            <Button colorPalette="purple" size="sm" onClick={() => toastPlan(autoSchedule("full"), "Schedule re-planned")}>
              Re-plan my week
            </Button>
          }
        />
      )}
      {overdue > 0 && (
        <Banner
          color="red"
          icon={<LuFlame />}
          title={`${overdue} overdue task${overdue === 1 ? "" : "s"}`}
          text="They are placed first in your next free time when you re-plan."
          action={
            <Button asChild colorPalette="red" size="sm" variant="outline">
              <NextLink href="/tasks">View tasks</NextLink>
            </Button>
          }
        />
      )}
      {unplanned.length > 0 && !missed && (
        <Banner
          color="teal"
          icon={<LuSparkles />}
          title={`${unplanned.length} task${unplanned.length === 1 ? " has" : "s have"} time that is not planned yet`}
          text="Let the planner find free time for them before their deadlines."
          action={
            <Button colorPalette="teal" size="sm" onClick={() => toastPlan(autoSchedule("incremental"), "Tasks scheduled")}>
              <LuSparkles /> Auto-schedule
            </Button>
          }
        />
      )}
    </Stack>
  );
}
