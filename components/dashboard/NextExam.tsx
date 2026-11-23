"use client";

import { Badge, Box, Button, HStack, Progress, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuGraduationCap } from "react-icons/lu";
import { SectionCard, SubjectBadge } from "@/components/Shared";
import { usePlanner } from "@/context/PlannerContext";
import { countdown, fmtDateTime } from "@/lib/format";

/** Countdown to your nearest exam. */
export function NextExam() {
  const { exams, tasks, now, getSubject } = usePlanner();
  const exam = exams
    .filter((e) => Date.parse(e.startsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];

  if (!exam) {
    return (
      <SectionCard title="Exams" icon={<LuGraduationCap />}>
        <Text color="fg.muted">No exams coming up. Add one to get a countdown and a study plan.</Text>
        <Button asChild size="sm" variant="outline" w="fit-content">
          <NextLink href="/exams">Add an exam</NextLink>
        </Button>
      </SectionCard>
    );
  }

  const starts = Date.parse(exam.startsAt);
  const c = countdown(starts, now);
  const study = tasks.filter((t) => t.examId === exam.id);
  const studyDone = study.filter((t) => t.status === "done").length;
  const urgent = c.days < 3;

  return (
    <SectionCard
      title="Next exam"
      icon={<LuGraduationCap />}
      action={
        <Button asChild size="xs" variant="ghost" colorPalette="teal">
          <NextLink href="/exams">All exams</NextLink>
        </Button>
      }
    >
      <HStack gap={2} wrap="wrap">
        <Text fontWeight="semibold" fontSize="lg">
          {exam.title}
        </Text>
        <SubjectBadge subject={getSubject(exam.subjectId)} />
      </HStack>
      <Box colorPalette={urgent ? "red" : "teal"}>
        <HStack align="baseline" gap={2}>
          <Text fontSize="4xl" fontWeight="bold" lineHeight="1" color="colorPalette.fg">
            {c.days}
          </Text>
          <Text color="fg.muted">day{c.days === 1 ? "" : "s"}</Text>
          <Text fontSize="2xl" fontWeight="semibold" color="colorPalette.fg">
            {c.hours}
          </Text>
          <Text color="fg.muted">h</Text>
        </HStack>
      </Box>
      <Text fontSize="sm" color="fg.muted">
        {fmtDateTime(starts)}
        {exam.venue ? ` · ${exam.venue}` : ""}
      </Text>
      {study.length > 0 ? (
        <Stack gap={1}>
          <HStack justify="space-between">
            <Text fontSize="xs" color="fg.muted">
              Study plan
            </Text>
            <Badge variant="subtle" colorPalette="teal">
              {studyDone}/{study.length} done
            </Badge>
          </HStack>
          <Progress.Root value={(studyDone / study.length) * 100} size="xs" colorPalette="teal">
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
        </Stack>
      ) : (
        <Button asChild size="sm" variant="outline" colorPalette="teal" w="fit-content">
          <NextLink href="/exams">Create study plan</NextLink>
        </Button>
      )}
    </SectionCard>
  );
}
