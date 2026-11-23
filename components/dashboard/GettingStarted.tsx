"use client";

import { Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuCheck } from "react-icons/lu";
import { SectionCard } from "@/components/Shared";
import { usePlanner } from "@/context/PlannerContext";

/** A short checklist for new accounts. Disappears once the basics are set up. */
export function GettingStarted() {
  const { subjects, classes, tasks } = usePlanner();

  const steps = [
    { done: subjects.length > 0, title: "Add your subjects", text: "Name and colour for each course.", href: "/subjects", cta: "Add subjects" },
    { done: classes.length > 0, title: "Add your classes", text: "Your fixed weekly timetable.", href: "/timetable", cta: "Add classes" },
    { done: false, title: "Check your daily routine", text: "Wake up, meals, prayer, bath, relax and bed time are protected from study.", href: "/settings", cta: "Open settings" },
    { done: tasks.length > 0, title: "Add an assignment", text: "Tell it how long it takes. It plans the rest.", href: "/tasks?new=1", cta: "Add a task" },
  ];

  if (subjects.length > 0 && classes.length > 0 && tasks.length > 0) return null;

  return (
    <Box mb={6}>
      <SectionCard title="Get started in 4 steps">
        <Stack gap={3}>
          {steps.map((s, i) => (
            <HStack key={s.title} gap={3} align="flex-start">
              <Box
                boxSize="6"
                rounded="full"
                flexShrink={0}
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontSize="xs"
                fontWeight="bold"
                bg={s.done ? "teal.500" : "bg.muted"}
                color={s.done ? "white" : "fg.muted"}
              >
                {s.done ? <LuCheck /> : i + 1}
              </Box>
              <Stack gap={0} flex="1" minW={0}>
                <Text fontWeight="medium">{s.title}</Text>
                <Text fontSize="sm" color="fg.muted">
                  {s.text}
                </Text>
              </Stack>
              {!s.done && (
                <Button asChild size="xs" variant="outline">
                  <NextLink href={s.href}>{s.cta}</NextLink>
                </Button>
              )}
            </HStack>
          ))}
        </Stack>
      </SectionCard>
    </Box>
  );
}
