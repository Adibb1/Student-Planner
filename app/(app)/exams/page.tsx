"use client";

import {
  Badge,
  Box,
  Button,
  Card,
  HStack,
  IconButton,
  Input,
  NumberInput,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuGraduationCap, LuPencil, LuPlus, LuSparkles } from "react-icons/lu";
import { EmptyState, FormField, LoadingScreen, PageContainer, PageHeader, SubjectBadge } from "@/components/Shared";
import { FormDialog } from "@/components/ui/FormDialog";
import { Select } from "@/components/ui/Select";
import { estimateChips } from "@/config/site";
import { usePlanner } from "@/context/PlannerContext";
import { countdown, fmtDateTime, fmtDuration, fromLocalInput, toLocalInput } from "@/lib/format";
import { toastPlan } from "@/lib/notify";
import { HOUR, addDays, startOfDay } from "@/lib/scheduler";
import type { Exam } from "@/lib/types";

type Draft = {
  id?: string;
  title: string;
  subjectId: string;
  startsAt: string;
  durationMin: number;
  venue: string;
  topics: string;
  prepHours: number;
  makePlan: boolean;
};

const blank = (now: number, subjectId = ""): Draft => ({
  title: "",
  subjectId,
  startsAt: toLocalInput(addDays(startOfDay(now), 14) + 9 * HOUR),
  durationMin: 120,
  venue: "",
  topics: "",
  prepHours: 8,
  makePlan: true,
});

export default function ExamsPage() {
  const { loading, now, exams, tasks, blocks, subjects, getSubject, addExam, updateExam, deleteExam, generateStudyPlan } =
    usePlanner();
  const [draft, setDraft] = useState<Draft | null>(null);

  if (loading) return <LoadingScreen />;

  const upcoming = exams.filter((e) => Date.parse(e.startsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const past = exams.filter((e) => Date.parse(e.startsAt) <= now).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));

  const topicList = (text: string) =>
    text
      .split(/\n|,/)
      .map((t) => t.trim())
      .filter(Boolean);

  const valid = !!draft && draft.title.trim().length > 0 && Number.isFinite(fromLocalInput(draft.startsAt)) && draft.prepHours > 0;

  const save = () => {
    if (!draft || !valid) return;
    const data = {
      title: draft.title.trim(),
      subjectId: draft.subjectId || null,
      startsAt: new Date(fromLocalInput(draft.startsAt)).toISOString(),
      durationMin: draft.durationMin,
      venue: draft.venue.trim() || undefined,
      topics: topicList(draft.topics),
      prepMin: Math.round(draft.prepHours * 60),
    };
    let id = draft.id;
    if (id) updateExam(id, data);
    else id = addExam(data as Omit<Exam, "id">);
    if (draft.makePlan && id) {
      toastPlan(generateStudyPlan(id, { ...data, id }).plan, "Study plan created");
    }
    setDraft(null);
  };

  const card = (e: Exam, isPast: boolean) => {
    const starts = Date.parse(e.startsAt);
    const c = countdown(starts, now);
    const study = tasks.filter((t) => t.examId === e.id);
    const doneCount = study.filter((t) => t.status === "done").length;
    const plannedCount = blocks.filter((b) => study.some((t) => t.id === b.taskId) && b.status === "planned").length;
    const urgent = !isPast && c.days < 3;

    return (
      <Card.Root key={e.id} variant="outline" colorPalette={urgent ? "red" : "teal"} opacity={isPast ? 0.65 : 1} transition="all 0.2s" _hover={{ borderColor: "teal.500", transform: "translateY(-3px)" }}>
        <Card.Body gap={3}>
          <HStack justify="space-between" align="flex-start" gap={3}>
            <Stack gap={1} minW={0}>
              <Card.Title fontSize="xl">{e.title}</Card.Title>
              <HStack gap={2} wrap="wrap">
                <SubjectBadge subject={getSubject(e.subjectId)} />
                <Text fontSize="sm" color="fg.muted">
                  {fmtDateTime(starts)} · {fmtDuration(e.durationMin)}
                  {e.venue ? ` · ${e.venue}` : ""}
                </Text>
              </HStack>
            </Stack>
            <IconButton
              aria-label="Edit exam"
              size="sm"
              variant="ghost"
              onClick={() =>
                setDraft({
                  id: e.id,
                  title: e.title,
                  subjectId: e.subjectId || "",
                  startsAt: toLocalInput(starts),
                  durationMin: e.durationMin,
                  venue: e.venue || "",
                  topics: e.topics.join("\n"),
                  prepHours: Math.round((e.prepMin / 60) * 10) / 10,
                  makePlan: false,
                })
              }
            >
              <LuPencil />
            </IconButton>
          </HStack>

          {!isPast && (
            <HStack align="baseline" gap={2}>
              <Text fontSize="4xl" fontWeight="bold" lineHeight="1" color="colorPalette.fg">
                {c.days}
              </Text>
              <Text color="fg.muted">day{c.days === 1 ? "" : "s"}</Text>
              <Text fontSize="2xl" fontWeight="semibold" color="colorPalette.fg">
                {c.hours}
              </Text>
              <Text color="fg.muted">h to go</Text>
            </HStack>
          )}

          {e.topics.length > 0 && (
            <HStack gap={1} wrap="wrap">
              {e.topics.map((t) => (
                <Badge key={t} variant="surface" colorPalette="teal">
                  {t}
                </Badge>
              ))}
            </HStack>
          )}

          {!isPast && (
            <Stack gap={2} pt={1}>
              {study.length > 0 ? (
                <>
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="fg.muted">
                      Study plan: {doneCount}/{study.length} parts done · {plannedCount} session{plannedCount === 1 ? "" : "s"} planned
                    </Text>
                  </HStack>
                  <Progress.Root value={(doneCount / study.length) * 100} size="xs" colorPalette="teal">
                    <Progress.Track>
                      <Progress.Range />
                    </Progress.Track>
                  </Progress.Root>
                </>
              ) : (
                <Text fontSize="sm" color="fg.muted">
                  No study plan yet. You planned for {fmtDuration(e.prepMin)} of study.
                </Text>
              )}
              <Button
                size="sm"
                variant="outline"
                colorPalette="teal"
                w="fit-content"
                onClick={() => {
                  if (study.some((t) => t.status === "todo") && !confirm("This replaces the unfinished study tasks for this exam with a new plan. Continue?")) return;
                  toastPlan(generateStudyPlan(e.id).plan, study.length ? "Study plan refreshed" : "Study plan created");
                }}
              >
                <LuSparkles /> {study.length ? "Rebuild study plan" : "Create study plan"}
              </Button>
            </Stack>
          )}
        </Card.Body>
      </Card.Root>
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title="Exams"
        subtitle="Add an exam with its topics and how much study time you think you need. The planner turns it into study sessions that fit around your classes and routine."
        actions={
          <Button colorPalette="teal" onClick={() => setDraft(blank(now, subjects[0]?.id))}>
            <LuPlus /> Add exam
          </Button>
        }
      />

      {exams.length === 0 ? (
        <EmptyState
          icon={<LuGraduationCap />}
          title="No exams yet"
          text="Add a test or final exam to get a countdown and an automatic study plan."
          action={
            <Button colorPalette="teal" onClick={() => setDraft(blank(now, subjects[0]?.id))}>
              <LuPlus /> Add an exam
            </Button>
          }
        />
      ) : (
        <Stack gap={8}>
          {upcoming.length > 0 && <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>{upcoming.map((e) => card(e, false))}</SimpleGrid>}
          {past.length > 0 && (
            <Box>
              <Text fontWeight="semibold" mb={3} color="fg.muted">
                Past exams
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
                {past.map((e) => card(e, true))}
              </SimpleGrid>
            </Box>
          )}
        </Stack>
      )}

      <FormDialog
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit exam" : "New exam"}
        onSubmit={save}
        submitDisabled={!valid}
        size="lg"
        footerLeft={
          draft?.id ? (
            <Button
              type="button"
              variant="ghost"
              colorPalette="red"
              onClick={() => {
                if (draft.id && confirm("Delete this exam and its study tasks?")) {
                  deleteExam(draft.id);
                  setDraft(null);
                }
              }}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {draft && (
          <Stack gap={4}>
            <FormField label="Exam name">
              <Input autoFocus value={draft.title} placeholder="e.g. Math midterm" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </FormField>
            <FormField label="Subject">
              <Select
                value={draft.subjectId}
                onChange={(v) => setDraft({ ...draft, subjectId: v })}
                placeholder="No subject"
                options={subjects.map((s) => ({ value: s.id, label: s.name }))}
              />
            </FormField>
            <HStack align="flex-start" gap={3} flexDirection={{ base: "column", sm: "row" }}>
              <FormField label="Starts">
                <Input type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
              </FormField>
              <FormField label="Length (minutes)">
                <NumberInput.Root min={15} max={600} step={15} value={String(draft.durationMin)} onValueChange={(e) => setDraft({ ...draft, durationMin: Number(e.value) || 60 })}>
                  <NumberInput.Input />
                </NumberInput.Root>
              </FormField>
            </HStack>
            <FormField label="Venue (optional)">
              <Input value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} />
            </FormField>
            <FormField label="Topics to study" hint="One per line or separated by commas. Each topic becomes a study task.">
              <Textarea rows={4} value={draft.topics} placeholder={"Algebra\nCalculus\nStatistics"} onChange={(e) => setDraft({ ...draft, topics: e.target.value })} />
            </FormField>
            <FormField label="How many hours of study will you need in total?" hint="Your best guess. It is split across the topics, with some time kept for past papers.">
              <Stack gap={3} w="full">
                <HStack gap={2} wrap="wrap">
                  {estimateChips
                    .filter((c) => c.minutes >= 120)
                    .concat([{ label: "12 h", minutes: 720 }, { label: "20 h", minutes: 1200 }])
                    .map((c) => (
                      <Button
                        key={c.minutes}
                        type="button"
                        size="xs"
                        variant={draft.prepHours * 60 === c.minutes ? "solid" : "outline"}
                        colorPalette={draft.prepHours * 60 === c.minutes ? "teal" : undefined}
                        onClick={() => setDraft({ ...draft, prepHours: c.minutes / 60 })}
                      >
                        {c.label}
                      </Button>
                    ))}
                </HStack>
                <NumberInput.Root min={0.5} max={100} step={0.5} value={String(draft.prepHours)} onValueChange={(e) => setDraft({ ...draft, prepHours: Number(e.value) || 0 })} w="32">
                  <NumberInput.Input aria-label="Study hours" />
                </NumberInput.Root>
              </Stack>
            </FormField>
            {!draft.id && (
              <Button type="button" size="sm" variant={draft.makePlan ? "subtle" : "outline"} colorPalette="teal" w="fit-content" onClick={() => setDraft({ ...draft, makePlan: !draft.makePlan })}>
                <LuSparkles /> {draft.makePlan ? "Study plan will be created" : "Create a study plan too"}
              </Button>
            )}
            {draft.id && (
              <Text fontSize="xs" color="fg.muted">
                After changing topics or study hours, use "Rebuild study plan" on the exam card.
              </Text>
            )}
          </Stack>
        )}
      </FormDialog>
    </PageContainer>
  );
}
