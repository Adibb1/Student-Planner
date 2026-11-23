"use client";

import { Button, Grid, GridItem, SimpleGrid } from "@chakra-ui/react";
import NextLink from "next/link";
import { useMemo } from "react";
import { LuCalendarDays, LuClock, LuFlame, LuPlus, LuTimer } from "react-icons/lu";
import { AlertBanners } from "@/components/dashboard/AlertBanners";
import { DueSoon } from "@/components/dashboard/DueSoon";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { NextExam } from "@/components/dashboard/NextExam";
import { TodayAgenda } from "@/components/dashboard/TodayAgenda";
import { LoadingScreen, PageContainer, PageHeader, StatCard } from "@/components/Shared";
import { useAuth } from "@/context/AuthContext";
import { usePlanner } from "@/context/PlannerContext";
import { buildDayItems } from "@/lib/agenda";
import { fmtDateLong, fmtDuration, greeting } from "@/lib/format";
import { MIN, freeSlotsForDay, startOfDay } from "@/lib/scheduler";

export default function DashboardPage() {
  const { user } = useAuth();
  const { loading, now, settings, classes, blocks, tasks, subjects, alerts, focusLogs } = usePlanner();

  const stats = useMemo(() => {
    const day = startOfDay(now);
    const items = buildDayItems(day, { settings, classes, blocks, tasks, subjects, now });
    const study = items.filter((i) => i.kind === "study");
    const plannedMin = study.reduce((s, i) => s + (i.end - i.start) / MIN, 0);
    const doneMin = study.filter((i) => i.done).reduce((s, i) => s + (i.end - i.start) / MIN, 0);

    const obstacles = blocks.map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
    const free = freeSlotsForDay(day, { settings, classes, subjects, obstacles }).reduce(
      (sum, s) => sum + Math.max(0, s.end - Math.max(s.start, now)) / MIN,
      0,
    );
    const focusToday = focusLogs.filter((l) => Date.parse(l.at) >= day).reduce((s, l) => s + l.minutes, 0);
    return { plannedMin, doneMin, free, focusToday, classCount: items.filter((i) => i.kind === "class").length };
  }, [now, settings, classes, blocks, tasks, subjects, focusLogs]);

  if (loading) return <LoadingScreen label="Loading your schedule..." />;

  const firstName = (user?.displayName || "").split(" ")[0];

  return (
    <PageContainer>
      <PageHeader
        title={`${greeting(now)}${firstName ? `, ${firstName}` : ""}`}
        subtitle={fmtDateLong(now)}
        actions={
          <>
            <Button asChild variant="outline">
              <NextLink href="/timetable">
                <LuCalendarDays /> Timetable
              </NextLink>
            </Button>
            <Button asChild colorPalette="teal">
              <NextLink href="/tasks?new=1">
                <LuPlus /> Add task
              </NextLink>
            </Button>
          </>
        }
      />

      <AlertBanners />
      <GettingStarted />

      <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} mb={6}>
        <StatCard
          label="Classes today"
          value={stats.classCount}
          icon={<LuCalendarDays />}
        />
        <StatCard
          label="Study planned"
          value={fmtDuration(stats.plannedMin)}
          hint={`${fmtDuration(stats.doneMin)} done`}
          icon={<LuTimer />}
          color="blue"
        />
        <StatCard
          label="Due today"
          value={alerts.dueToday.length}
          hint={alerts.overdue.length ? `${alerts.overdue.length} overdue` : "Nothing overdue"}
          icon={<LuFlame />}
          color={alerts.overdue.length ? "red" : "orange"}
        />
        <StatCard
          label="Free time left"
          value={fmtDuration(stats.free)}
          hint={stats.focusToday ? `${fmtDuration(stats.focusToday)} focused today` : "After classes, meals & prayer"}
          icon={<LuClock />}
          color="green"
        />
      </SimpleGrid>

      <Grid templateColumns={{ base: "1fr", lg: "3fr 2fr" }} gap={6} alignItems="start">
        <GridItem minW={0}>
          <TodayAgenda />
        </GridItem>
        <GridItem minW={0} display="flex" flexDirection="column" gap={6}>
          <DueSoon />
          <NextExam />
        </GridItem>
      </Grid>
    </PageContainer>
  );
}
