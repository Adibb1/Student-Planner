"use client";

import { Badge, Box, Button, Card, Checkbox, Collapsible, HStack, IconButton, Progress, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useState } from "react";
import { LuChevronDown, LuLock, LuLockOpen, LuPencil, LuPlay, LuRotateCcw, LuTrash2 } from "react-icons/lu";
import { SubjectBadge } from "@/components/Shared";
import { priorities } from "@/config/site";
import { usePlanner } from "@/context/PlannerContext";
import { fmtDateTime, fmtDue, fmtDuration, fmtTime } from "@/lib/format";
import { toastPlan } from "@/lib/notify";
import { blockMinutes, isMissed, isOverdue, plannedMinutes, progressPercent, remainingMinutes } from "@/lib/scheduler";
import type { Task } from "@/lib/types";

export function TaskCard({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) {
  const { blocks, now, getSubject, completeTask, reopenTask, toggleBlockDone, toggleBlockLock, deleteBlock } = usePlanner();
  const [open, setOpen] = useState(false);

  const done = task.status === "done";
  const late = isOverdue(task, now);
  const mine = blocks.filter((b) => b.taskId === task.id).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const remaining = remainingMinutes(task, blocks);
  const unplanned = done ? 0 : Math.max(0, remaining - plannedMinutes(task.id, blocks));
  const priority = priorities.find((p) => p.value === task.priority);

  return (
    <Card.Root variant="outline" borderColor={late ? "red.500" : undefined} opacity={done ? 0.75 : 1}>
      <Card.Body gap={3}>
        <HStack align="flex-start" gap={3}>
          <Checkbox.Root
            mt="3px"
            colorPalette="teal"
            checked={done}
            onCheckedChange={(e) => {
              if (e.checked) completeTask(task.id);
              else toastPlan(reopenTask(task.id), "Task reopened");
            }}
          >
            <Checkbox.HiddenInput aria-label={`Mark "${task.title}" as done`} />
            <Checkbox.Control />
          </Checkbox.Root>

          <Stack gap={1} flex="1" minW={0}>
            <HStack gap={2} wrap="wrap">
              <Text fontWeight="semibold" fontSize="lg" textDecoration={done ? "line-through" : undefined}>
                {task.title}
              </Text>
              <SubjectBadge subject={getSubject(task.subjectId)} />
              {task.priority === "high" && !done && (
                <Badge colorPalette={priority?.color} variant="subtle">
                  High priority
                </Badge>
              )}
              {task.kind === "study" && (
                <Badge variant="outline" colorPalette="blue">
                  Study
                </Badge>
              )}
            </HStack>
            <Text fontSize="sm" color={late && !done ? "red.500" : "fg.muted"} fontWeight={late && !done ? "semibold" : undefined}>
              {done ? `Done${task.completedAt ? ` · ${fmtDateTime(Date.parse(task.completedAt))}` : ""}` : fmtDue(Date.parse(task.dueAt), now)}
              {" · "}
              {fmtDuration(task.estimateMin)} estimated
            </Text>
          </Stack>

          <HStack gap={0} flexShrink={0}>
            {!done && (
              <IconButton asChild aria-label="Start focus timer" size="sm" variant="ghost" colorPalette="teal">
                <NextLink href={`/focus?task=${task.id}`}>
                  <LuPlay />
                </NextLink>
              </IconButton>
            )}
            <IconButton aria-label="Edit task" size="sm" variant="ghost" onClick={() => onEdit(task)}>
              <LuPencil />
            </IconButton>
          </HStack>
        </HStack>

        {!done && (
          <Stack gap={1}>
            <Progress.Root value={progressPercent(task, blocks)} size="sm" colorPalette={late ? "red" : "teal"}>
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
            <HStack justify="space-between" fontSize="xs" color="fg.muted" wrap="wrap">
              <Text>{fmtDuration(remaining)} left to do</Text>
              {unplanned > 0 ? (
                <Text color="orange.500">{fmtDuration(unplanned)} not planned yet</Text>
              ) : (
                <Text>All planned</Text>
              )}
            </HStack>
          </Stack>
        )}

        {!done && mine.length > 0 && (
          <Collapsible.Root open={open} onOpenChange={(e) => setOpen(e.open)}>
            <Collapsible.Trigger asChild>
              <Button size="xs" variant="ghost" colorPalette="teal" w="fit-content">
                {mine.length} session{mine.length === 1 ? "" : "s"}
                <Box transition="transform 0.2s" transform={open ? "rotate(180deg)" : undefined}>
                  <LuChevronDown />
                </Box>
              </Button>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <Stack gap={2} pt={2}>
                {mine.map((b) => {
                  const missed = isMissed(b, now);
                  return (
                    <HStack
                      key={b.id}
                      gap={3}
                      px={3}
                      py={2}
                      rounded="md"
                      bg="bg.muted"
                      borderLeftWidth="3px"
                      borderLeftColor={b.status === "done" ? "green.500" : missed ? "red.500" : "teal.500"}
                    >
                      <Checkbox.Root size="sm" colorPalette="teal" checked={b.status === "done"} onCheckedChange={() => toggleBlockDone(b.id)}>
                        <Checkbox.HiddenInput aria-label="Mark session as done" />
                        <Checkbox.Control />
                      </Checkbox.Root>
                      <Stack gap={0} flex="1" minW={0}>
                        <Text fontSize="sm" textDecoration={b.status === "done" ? "line-through" : undefined}>
                          {new Date(b.start).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })},{" "}
                          {fmtTime(Date.parse(b.start))} – {fmtTime(Date.parse(b.end))}
                        </Text>
                        <Text fontSize="xs" color={missed ? "red.500" : "fg.muted"}>
                          {fmtDuration(blockMinutes(b))}
                          {b.focusedMin ? ` · ${fmtDuration(b.focusedMin)} worked` : ""}
                          {missed ? " · missed" : ""}
                          {b.locked ? " · fixed time" : ""}
                          {b.stretch === "late" ? " · late night" : b.stretch === "relax" ? " · uses relax time" : ""}
                        </Text>
                      </Stack>
                      <IconButton
                        aria-label={b.locked ? "Let the planner move this session" : "Keep this session at this time"}
                        title={b.locked ? "Fixed: the planner will not move it" : "Free: the planner may move it"}
                        size="xs"
                        variant="ghost"
                        onClick={() => toggleBlockLock(b.id)}
                      >
                        {b.locked ? <LuLock /> : <LuLockOpen />}
                      </IconButton>
                      <IconButton aria-label="Delete session" size="xs" variant="ghost" colorPalette="red" onClick={() => deleteBlock(b.id)}>
                        <LuTrash2 />
                      </IconButton>
                    </HStack>
                  );
                })}
              </Stack>
            </Collapsible.Content>
          </Collapsible.Root>
        )}

        {done && (
          <Button size="xs" variant="ghost" w="fit-content" onClick={() => toastPlan(reopenTask(task.id), "Task reopened")}>
            <LuRotateCcw /> Reopen
          </Button>
        )}
      </Card.Body>
    </Card.Root>
  );
}
