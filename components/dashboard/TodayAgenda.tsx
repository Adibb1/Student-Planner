"use client";

import { Stack, Switch, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuCalendarDays } from "react-icons/lu";
import { AgendaRow } from "@/components/AgendaRow";
import { SectionCard } from "@/components/Shared";
import { usePlanner } from "@/context/PlannerContext";
import { buildDayItems } from "@/lib/agenda";
import { startOfDay } from "@/lib/scheduler";

/** Everything happening today in time order. */
export function TodayAgenda() {
  const { settings, classes, blocks, tasks, subjects, now } = usePlanner();
  const [showRoutine, setShowRoutine] = useState(true);

  const items = useMemo(
    () => buildDayItems(startOfDay(now), { settings, classes, blocks, tasks, subjects, now }),
    [settings, classes, blocks, tasks, subjects, now],
  );
  const visible = showRoutine ? items : items.filter((i) => i.kind !== "routine");

  return (
    <SectionCard
      title="Today's schedule"
      icon={<LuCalendarDays />}
      action={
        <Switch.Root size="sm" colorPalette="teal" checked={showRoutine} onCheckedChange={(e) => setShowRoutine(e.checked)}>
          <Switch.HiddenInput />
          <Switch.Control />
          <Switch.Label fontSize="xs" color="fg.muted">
            Meals & prayer
          </Switch.Label>
        </Switch.Root>
      }
    >
      {visible.length === 0 ? (
        <Text color="fg.muted">Nothing planned for today. Enjoy the free time!</Text>
      ) : (
        <Stack gap={2}>
          {visible.map((item) => (
            <AgendaRow key={item.id} item={item} />
          ))}
        </Stack>
      )}
    </SectionCard>
  );
}
