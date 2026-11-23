"use client";

import { Badge, Box, Checkbox, HStack, IconButton, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import type { ReactNode } from "react";
import {
  LuBookOpen,
  LuClock,
  LuCoffee,
  LuGraduationCap,
  LuMoonStar,
  LuPlay,
  LuShowerHead,
  LuUtensils,
} from "react-icons/lu";
import { usePlanner } from "@/context/PlannerContext";
import { itemColor } from "@/lib/agenda";
import { fmtTime } from "@/lib/format";
import type { DayItem } from "@/lib/types";

const routineIcons: Record<string, ReactNode> = {
  prayer: <LuMoonStar />,
  meal: <LuUtensils />,
  bath: <LuShowerHead />,
  relax: <LuCoffee />,
  other: <LuClock />,
};

function iconFor(item: DayItem): ReactNode {
  if (item.kind === "class") return <LuGraduationCap />;
  if (item.kind === "study") return <LuBookOpen />;
  return routineIcons[item.routineKind || "other"];
}

/** One line in a day's schedule: a class, a meal/prayer, or a planned study session. */
export function AgendaRow({ item }: { item: DayItem }) {
  const { subjects, now, toggleBlockDone } = usePlanner();
  const color = itemColor(item, subjects);
  const isNow = item.start <= now && now < item.end;
  const isRoutine = item.kind === "routine";
  const isStudy = item.kind === "study";

  return (
    <HStack
      colorPalette={color}
      gap={3}
      px={3}
      py={isRoutine ? 2 : 3}
      rounded="lg"
      bg={isRoutine ? "transparent" : "colorPalette.subtle"}
      borderWidth="1px"
      borderStyle={isRoutine ? "dashed" : "solid"}
      borderColor={isNow ? "colorPalette.solid" : isRoutine ? "border" : "transparent"}
      borderLeftWidth="4px"
      borderLeftColor="colorPalette.solid"
      opacity={item.done ? 0.6 : isRoutine ? 0.85 : 1}
    >
      <Stack gap={0} minW="16" flexShrink={0}>
        <Text fontSize="xs" fontWeight="medium" whiteSpace="nowrap">
          {fmtTime(item.start)}
        </Text>
        <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap">
          {fmtTime(item.end)}
        </Text>
      </Stack>

      <Box color="colorPalette.fg" fontSize="lg" flexShrink={0}>
        {iconFor(item)}
      </Box>

      <Stack gap={0} flex="1" minW={0}>
        <Text
          fontWeight={isRoutine ? "normal" : "medium"}
          textDecoration={item.done ? "line-through" : undefined}
          truncate
        >
          {item.title}
        </Text>
        {item.subtitle && (
          <Text fontSize="xs" color="fg.muted" truncate>
            {item.subtitle}
          </Text>
        )}
      </Stack>

      <HStack gap={1} flexShrink={0}>
        {isNow && !item.done && (
          <Badge colorPalette="teal" variant="solid">
            Now
          </Badge>
        )}
        {item.missed && (
          <Badge colorPalette="red" variant="solid">
            Missed
          </Badge>
        )}
        {item.locked && isStudy && !item.done && (
          <Badge colorPalette="gray" variant="outline" display={{ base: "none", sm: "inline-flex" }}>
            Fixed
          </Badge>
        )}
        {isStudy && item.blockId && (
          <>
            {!item.done && (
              <IconButton asChild aria-label="Start focus timer" size="xs" variant="ghost" colorPalette="teal">
                <NextLink href={`/focus?task=${item.taskId}&block=${item.blockId}`}>
                  <LuPlay />
                </NextLink>
              </IconButton>
            )}
            <Checkbox.Root
              colorPalette="teal"
              checked={!!item.done}
              onCheckedChange={() => toggleBlockDone(item.blockId as string)}
            >
              <Checkbox.HiddenInput aria-label="Mark session as done" />
              <Checkbox.Control />
            </Checkbox.Root>
          </>
        )}
      </HStack>
    </HStack>
  );
}
