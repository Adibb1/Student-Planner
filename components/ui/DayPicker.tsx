"use client";

import { Button, HStack } from "@chakra-ui/react";
import { weekOrder, weekdayShort } from "@/config/site";
import type { Weekday } from "@/lib/types";

/** Pick one or more days of the week (Mon → Sun). */
export function DayPicker({
  value,
  onChange,
  single = false,
}: {
  value: Weekday[];
  onChange: (days: Weekday[]) => void;
  /** Only one day can be selected. */
  single?: boolean;
}) {
  const toggle = (day: Weekday) => {
    if (single) return onChange([day]);
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort());
  };
  return (
    <HStack gap={1} wrap="wrap">
      {weekOrder.map((d) => {
        const on = value.includes(d);
        return (
          <Button
            key={d}
            type="button"
            size="xs"
            minW="10"
            variant={on ? "solid" : "outline"}
            colorPalette={on ? "teal" : undefined}
            onClick={() => toggle(d)}
            aria-pressed={on}
          >
            {weekdayShort[d]}
          </Button>
        );
      })}
    </HStack>
  );
}
