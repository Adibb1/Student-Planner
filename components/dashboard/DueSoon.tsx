"use client";

import { Button, HStack, IconButton, Progress, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuCheck, LuListChecks } from "react-icons/lu";
import { SectionCard, SubjectBadge } from "@/components/Shared";
import { usePlanner } from "@/context/PlannerContext";
import { fmtDue } from "@/lib/format";
import { isOverdue, progressPercent } from "@/lib/scheduler";

/** The next few things that are due, including overdue ones. */
export function DueSoon() {
  const { tasks, blocks, now, getSubject, completeTask } = usePlanner();
  const list = tasks
    .filter((t) => t.status === "todo")
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, 6);

  return (
    <SectionCard
      title="Due soon"
      icon={<LuListChecks />}
      action={
        <Button asChild size="xs" variant="ghost" colorPalette="teal">
          <NextLink href="/tasks">All tasks</NextLink>
        </Button>
      }
    >
      {list.length === 0 ? (
        <Text color="fg.muted">Nothing due. Add a task to get started.</Text>
      ) : (
        <Stack gap={4}>
          {list.map((t) => {
            const due = Date.parse(t.dueAt);
            const late = isOverdue(t, now);
            return (
              <HStack key={t.id} gap={3} align="flex-start">
                <IconButton
                  aria-label={`Mark "${t.title}" as done`}
                  size="xs"
                  variant="outline"
                  rounded="full"
                  onClick={() => completeTask(t.id)}
                >
                  <LuCheck />
                </IconButton>
                <Stack gap={1} flex="1" minW={0}>
                  <HStack gap={2} wrap="wrap">
                    <Text fontWeight="medium" lineClamp={2}>
                      {t.title}
                    </Text>
                    <SubjectBadge subject={getSubject(t.subjectId)} />
                  </HStack>
                  <Text fontSize="xs" color={late ? "red.500" : "fg.muted"} fontWeight={late ? "semibold" : undefined}>
                    {fmtDue(due, now)}
                  </Text>
                  <Progress.Root value={progressPercent(t, blocks)} size="xs" colorPalette={late ? "red" : "teal"}>
                    <Progress.Track>
                      <Progress.Range />
                    </Progress.Track>
                  </Progress.Root>
                </Stack>
              </HStack>
            );
          })}
        </Stack>
      )}
    </SectionCard>
  );
}
