"use client";

import { Badge, Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { LuFlame, LuSparkles } from "react-icons/lu";
import type { StudyPreview } from "@/context/PlannerContext";
import { fmtDateTime, fmtDuration, fmtTime } from "@/lib/format";

/** "Does it fit?" check shown while editing an exam or a task. Nothing is saved. */
export function PlanPreview({
  preview,
  allowOvertime,
  open,
  onToggle,
  noun = "exam",
}: {
  preview: StudyPreview;
  allowOvertime: boolean;
  open: boolean;
  onToggle: () => void;
  /** What the plan must finish before: "exam" or "deadline". */
  noun?: "exam" | "deadline";
}) {
  if (preview.empty) {
    return (
      <Box rounded="lg" borderWidth="1px" borderColor="red.muted" bg="red.subtle" p={3}>
        <Text fontSize="sm">{noun === "exam" ? "There is not enough time before the exam to plan study sessions. Check the exam date." : "There is no time left before this deadline. Move the deadline to plan sessions."}</Text>
      </Box>
    );
  }
  const shortMin = preview.short.reduce((a, s) => a + s.missingMin, 0);
  const tone = shortMin > 0 ? "red" : preview.stretch ? "orange" : "green";
  const last = preview.sessions.length ? Math.max(...preview.sessions.map((x) => x.end)) : null;

  let title: string;
  let text: string;
  if (shortMin > 0) {
    title = `Does not fit: ${fmtDuration(shortMin)} short`;
    text = allowOvertime
      ? `Even with relax time and late nights there is no more room before the ${noun}. Shorten the time needed, or move the ${noun} if it is wrong.`
      : "Turn on the relax time / late night option, or shorten the time needed.";
  } else if (preview.stretch) {
    const parts = [
      preview.stretch.relaxMin ? `${fmtDuration(preview.stretch.relaxMin)} of relax time` : "",
      preview.stretch.lateMin ? `${fmtDuration(preview.stretch.lateMin)} after bed time (until ${preview.stretch.latestEnd ? fmtTime(preview.stretch.latestEnd) : "late"})` : "",
    ].filter(Boolean);
    title = "It fits, but your rest time is used";
    text = `Uses ${parts.join(" and ")}. Relax time is used first and the load is spread over the days.`;
  } else {
    title = "Fits in your free time";
    text = last ? `All ${fmtDuration(preview.totalMin)} planned. Last session ends ${fmtDateTime(last)}.` : "";
  }

  return (
    <Box colorPalette={tone} rounded="lg" borderWidth="1px" borderColor="colorPalette.muted" bg="colorPalette.subtle" p={3}>
      <HStack gap={2} align="flex-start">
        <Box color="colorPalette.fg" pt="2px">
          {tone === "green" ? <LuSparkles /> : <LuFlame />}
        </Box>
        <Stack gap={1} flex="1" minW={0}>
          <Text fontWeight="semibold">{title}</Text>
          <Text fontSize="sm" color="fg.muted">
            {text}
          </Text>
          {preview.sessions.length > 0 && (
            <>
              <Button type="button" size="xs" variant="ghost" w="fit-content" onClick={onToggle}>
                {open ? "Hide" : "Show"} {preview.sessions.length} planned session{preview.sessions.length === 1 ? "" : "s"}
              </Button>
              {open && (
                <Stack gap={1} maxH="48" overflowY="auto" fontSize="sm">
                  {preview.sessions.map((x, i) => (
                    <HStack key={i} gap={2} wrap="wrap">
                      <Text color="fg.muted" minW="32">
                        {new Date(x.start).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} {fmtTime(x.start)}–{fmtTime(x.end)}
                      </Text>
                      <Text flex="1" minW={0} truncate>
                        {x.title.replace(/^Study: /, "")}
                      </Text>
                      {x.stretch && (
                        <Badge size="xs" colorPalette={x.stretch === "late" ? "red" : "orange"} variant="subtle">
                          {x.stretch === "late" ? "Late night" : "Relax time"}
                        </Badge>
                      )}
                    </HStack>
                  ))}
                </Stack>
              )}
            </>
          )}
        </Stack>
      </HStack>
    </Box>
  );
}
