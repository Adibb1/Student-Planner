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
  Switch,
  Text,
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuArrowDown, LuArrowUp, LuGraduationCap, LuMoon, LuPencil, LuPlus, LuSparkles, LuTrash2, LuFlame } from "react-icons/lu";
import { EmptyState, FormField, LoadingScreen, PageContainer, PageHeader, SubjectBadge } from "@/components/Shared";
import { FormDialog } from "@/components/ui/FormDialog";
import { Select } from "@/components/ui/Select";
import { type StudyPreview, usePlanner } from "@/context/PlannerContext";
import { formatDurationShort, parseDuration } from "@/lib/duration";
import { countdown, fmtDateTime, fmtDuration, fmtTime, fromLocalInput, toLocalInput } from "@/lib/format";
import { toastPlan } from "@/lib/notify";
import { HOUR, addDays, atTime, examChapters, startOfDay } from "@/lib/scheduler";
import type { Exam } from "@/lib/types";

type ChapterRow = { key: string; name: string; time: string };

type Draft = {
  id?: string;
  title: string;
  subjectId: string;
  startsAt: string;
  durationMin: number;
  venue: string;
  chapters: ChapterRow[];
  bulk: string;
  recap: string;
  startFrom: string; // "" = as soon as possible
  finishBy: string; // "" = the evening before
  windowOn: boolean;
  winStart: string;
  winEnd: string;
  allowOvertime: boolean;
  makePlan: boolean;
};

let rowCounter = 0;
const newRow = (name = "", time = "45m"): ChapterRow => ({ key: `row-${Date.now()}-${rowCounter++}`, name, time });

const blank = (now: number, subjectId = ""): Draft => ({
  title: "",
  subjectId,
  startsAt: toLocalInput(addDays(startOfDay(now), 7) + 9 * HOUR),
  durationMin: 60,
  venue: "",
  chapters: [newRow("Chapter 1"), newRow("Chapter 2")],
  bulk: "",
  recap: "0",
  startFrom: "",
  finishBy: "",
  windowOn: false,
  winStart: "08:00",
  winEnd: "12:00",
  allowOvertime: true,
  makePlan: true,
});

const windowPresets = [
  { label: "Morning", start: "08:00", end: "12:00" },
  { label: "Afternoon", start: "13:00", end: "17:00" },
  { label: "Evening", start: "17:00", end: "22:00" },
];

/** Turns the form into an exam (or null while something is missing / invalid). */
function draftToExam(d: Draft): Omit<Exam, "id"> | null {
  const startsMs = fromLocalInput(d.startsAt);
  if (!d.title.trim() || !Number.isFinite(startsMs)) return null;
  const rows = d.chapters.filter((r) => r.name.trim() || r.time.trim());
  const chapters = rows.map((r) => ({ id: r.key, name: r.name.trim(), minutes: parseDuration(r.time) ?? 0 }));
  if (chapters.length === 0 || chapters.some((c) => !c.name || c.minutes <= 0)) return null;
  const recap = d.recap.trim() ? parseDuration(d.recap) ?? 0 : 0;
  const startFrom = d.startFrom ? fromLocalInput(d.startFrom) : NaN;
  const finishBy = d.finishBy ? fromLocalInput(d.finishBy) : NaN;
  return {
    title: d.title.trim(),
    subjectId: d.subjectId || null,
    startsAt: new Date(startsMs).toISOString(),
    durationMin: d.durationMin,
    venue: d.venue.trim() || undefined,
    topics: chapters.map((c) => c.name),
    prepMin: chapters.reduce((a, c) => a + c.minutes, 0) + recap,
    chapters,
    recapMin: recap,
    startFrom: Number.isFinite(startFrom) ? new Date(startFrom).toISOString() : null,
    finishBy: Number.isFinite(finishBy) ? new Date(finishBy).toISOString() : null,
    window: d.windowOn && d.winStart && d.winEnd ? { start: d.winStart, end: d.winEnd } : null,
    allowOvertime: d.allowOvertime,
  };
}

export default function ExamsPage() {
  const { loading, now, exams, tasks, blocks, subjects, getSubject, addExam, updateExam, deleteExam, generateStudyPlan, previewStudyPlan } =
    usePlanner();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showSessions, setShowSessions] = useState(false);

  // Live preview: what would the plan look like with the current form?
  const parsed = useMemo(() => (draft ? draftToExam(draft) : null), [draft]);
  const preview = useMemo(
    () => (parsed ? previewStudyPlan({ ...parsed, id: draft?.id || "new-exam" }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed, previewStudyPlan, draft?.id, now],
  );

  if (loading) return <LoadingScreen />;

  const upcoming = exams.filter((e) => Date.parse(e.startsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const past = exams.filter((e) => Date.parse(e.startsAt) <= now).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));

  const valid = !!parsed;
  const draftHasPlan = !!draft?.id && tasks.some((t) => t.examId === draft.id);

  const save = () => {
    if (!draft || !parsed) return;
    const data = parsed;
    if (draft.id) {
      // Editing: the existing plan is rebuilt automatically (so old sessions never stay behind).
      updateExam(draft.id, data);
      if (!draftHasPlan && draft.makePlan) {
        toastPlan(generateStudyPlan(draft.id, { ...data, id: draft.id }).plan, "Study plan created");
      }
    } else {
      const id = addExam(data as Omit<Exam, "id">);
      if (draft.makePlan) toastPlan(generateStudyPlan(id, { ...data, id }).plan, "Study plan created");
    }
    setDraft(null);
  };

  const openEdit = (e: Exam, starts: number) => {
    const { chapters, recapMin } = examChapters(e);
    setDraft({
      id: e.id,
      title: e.title,
      subjectId: e.subjectId || "",
      startsAt: toLocalInput(starts),
      durationMin: e.durationMin,
      venue: e.venue || "",
      chapters: chapters.map((c) => newRow(c.name, formatDurationShort(c.minutes))),
      bulk: "",
      recap: recapMin > 0 ? formatDurationShort(recapMin) : "0",
      startFrom: e.startFrom ? toLocalInput(Date.parse(e.startFrom)) : "",
      finishBy: e.finishBy ? toLocalInput(Date.parse(e.finishBy)) : "",
      windowOn: !!e.window,
      winStart: e.window?.start || "08:00",
      winEnd: e.window?.end || "12:00",
      allowOvertime: e.allowOvertime !== false,
      makePlan: tasks.some((t) => t.examId === e.id),
    });
    setShowSessions(false);
  };

  const card = (e: Exam, isPast: boolean) => {
    const starts = Date.parse(e.startsAt);
    const c = countdown(starts, now);
    const study = tasks.filter((t) => t.examId === e.id);
    const doneCount = study.filter((t) => t.status === "done").length;
    const plannedCount = blocks.filter((b) => study.some((t) => t.id === b.taskId) && b.status === "planned").length;
    const urgent = !isPast && c.days < 3;
    const stretchedCount = blocks.filter((b) => b.stretch && b.status === "planned" && Date.parse(b.end) > now && study.some((t) => t.id === b.taskId)).length;

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
              onClick={() => openEdit(e, starts)}
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

          {(() => {
            const { chapters, recapMin } = examChapters(e);
            const parts = [...chapters.map((c) => `${c.name} · ${fmtDuration(c.minutes)}`), ...(recapMin > 0 ? [`Final recap · ${fmtDuration(recapMin)}`] : [])];
            return parts.length > 0 ? (
              <HStack gap={1} wrap="wrap">
                {parts.map((t) => (
                  <Badge key={t} variant="surface" colorPalette="teal">
                    {t}
                  </Badge>
                ))}
              </HStack>
            ) : null;
          })()}

          {!isPast && stretchedCount > 0 && (
            <HStack gap={2} color="orange.fg" fontSize="sm">
              <LuMoon />
              <Text>
                {stretchedCount} session{stretchedCount === 1 ? "" : "s"} use relax time or late nights. Get enough sleep when you can.
              </Text>
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
        subtitle="Add an exam with its chapters and the time you want for each. The planner turns it into study sessions that fit around your classes and routine, and never plans anything after the exam starts."
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
            <Stack gap={2} w="full">
              <Box>
                <Text fontSize="sm" fontWeight="medium">
                  Chapters / topics
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  Type the time you want for each one: 45m, 1h, 1h30 or 90. Order = the order you study them.
                </Text>
              </Box>
              <Stack gap={2} w="full">
                {draft.chapters.map((row, i) => {
                  const bad = row.time.trim() !== "" && parseDuration(row.time) === null;
                  const update = (patch: Partial<ChapterRow>) =>
                    setDraft({ ...draft, chapters: draft.chapters.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
                  const move = (to: number) => {
                    if (to < 0 || to >= draft.chapters.length) return;
                    const list = [...draft.chapters];
                    const [item] = list.splice(i, 1);
                    list.splice(to, 0, item);
                    setDraft({ ...draft, chapters: list });
                  };
                  return (
                    <HStack key={row.key} gap={2}>
                      <Input flex="1" minW={0} value={row.name} placeholder={`Chapter ${i + 1}`} aria-label={`Chapter ${i + 1} name`} onChange={(e) => update({ name: e.target.value })} />
                      <Input w="24" value={row.time} placeholder="45m" aria-label={`Chapter ${i + 1} time`} invalid={bad} onChange={(e) => update({ time: e.target.value })} />
                      <IconButton type="button" size="xs" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i - 1)}>
                        <LuArrowUp />
                      </IconButton>
                      <IconButton type="button" size="xs" variant="ghost" aria-label="Move down" disabled={i === draft.chapters.length - 1} onClick={() => move(i + 1)}>
                        <LuArrowDown />
                      </IconButton>
                      <IconButton
                        type="button"
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        aria-label="Remove chapter"
                        disabled={draft.chapters.length === 1}
                        onClick={() => setDraft({ ...draft, chapters: draft.chapters.filter((_, j) => j !== i) })}
                      >
                        <LuTrash2 />
                      </IconButton>
                    </HStack>
                  );
                })}
                <HStack gap={2} wrap="wrap">
                  <Button type="button" size="xs" variant="outline" colorPalette="teal" onClick={() => setDraft({ ...draft, chapters: [...draft.chapters, newRow(`Chapter ${draft.chapters.length + 1}`)] })}>
                    <LuPlus /> Add chapter
                  </Button>
                  <Input
                    w="28"
                    size="xs"
                    value={draft.bulk}
                    placeholder="e.g. 1h"
                    aria-label="Same time for every chapter"
                    onChange={(e) => setDraft({ ...draft, bulk: e.target.value })}
                  />
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={parseDuration(draft.bulk) === null}
                    onClick={() => setDraft({ ...draft, chapters: draft.chapters.map((r) => ({ ...r, time: formatDurationShort(parseDuration(draft.bulk) || 0) })) })}
                  >
                    Same time for all
                  </Button>
                </HStack>
              </Stack>
            </Stack>

            <FormField label="Final recap / past papers (optional)" hint="Kept for the end of the plan. Type 0 for none.">
              <Input w="32" value={draft.recap} placeholder="30m" invalid={draft.recap.trim() !== "" && parseDuration(draft.recap) === null && draft.recap.trim() !== "0"} onChange={(e) => setDraft({ ...draft, recap: e.target.value })} />
            </FormField>

            <Box borderTopWidth="1px" pt={4}>
              <Text fontWeight="semibold" mb={3}>
                When to study
              </Text>
              <Stack gap={4}>
                <HStack align="flex-start" gap={3} flexDirection={{ base: "column", sm: "row" }}>
                  <FormField label="Start studying from" hint="Leave empty to start as soon as possible.">
                    <Input type="datetime-local" value={draft.startFrom} onChange={(e) => setDraft({ ...draft, startFrom: e.target.value })} />
                  </FormField>
                  <FormField label="Finish studying by" hint="Leave empty to finish the evening before.">
                    <Input type="datetime-local" value={draft.finishBy} onChange={(e) => setDraft({ ...draft, finishBy: e.target.value })} />
                  </FormField>
                </HStack>
                <HStack gap={2} wrap="wrap">
                  <Button type="button" size="xs" variant="outline" onClick={() => setDraft({ ...draft, startFrom: toLocalInput(atTime(startOfDay(now), "19:00")) })}>
                    Start tonight 19:00
                  </Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => setDraft({ ...draft, startFrom: toLocalInput(atTime(addDays(startOfDay(now), 1), "08:00")) })}>
                    Start tomorrow 08:00
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setDraft({ ...draft, startFrom: "", finishBy: "" })}>
                    Clear
                  </Button>
                </HStack>

                <Switch.Root colorPalette="teal" checked={draft.windowOn} onCheckedChange={(e) => setDraft({ ...draft, windowOn: e.checked })}>
                  <Switch.HiddenInput />
                  <Switch.Control />
                  <Switch.Label>Prefer a time of day for study sessions</Switch.Label>
                </Switch.Root>
                {draft.windowOn && (
                  <Stack gap={2}>
                    <HStack gap={2} wrap="wrap">
                      {windowPresets.map((p) => (
                        <Button
                          key={p.label}
                          type="button"
                          size="xs"
                          variant={draft.winStart === p.start && draft.winEnd === p.end ? "solid" : "outline"}
                          colorPalette={draft.winStart === p.start && draft.winEnd === p.end ? "teal" : undefined}
                          onClick={() => setDraft({ ...draft, winStart: p.start, winEnd: p.end })}
                        >
                          {p.label} {p.start}–{p.end}
                        </Button>
                      ))}
                    </HStack>
                    <HStack gap={2}>
                      <Input type="time" w="36" aria-label="Preferred from" value={draft.winStart} onChange={(e) => setDraft({ ...draft, winStart: e.target.value })} />
                      <Text color="fg.muted">to</Text>
                      <Input type="time" w="36" aria-label="Preferred until" value={draft.winEnd} onChange={(e) => setDraft({ ...draft, winEnd: e.target.value })} />
                    </HStack>
                    <Text fontSize="xs" color="fg.muted">
                      Used when possible. If it does not fit, other free times are used.
                    </Text>
                  </Stack>
                )}

                <Switch.Root colorPalette="orange" checked={draft.allowOvertime} onCheckedChange={(e) => setDraft({ ...draft, allowOvertime: e.checked })}>
                  <Switch.HiddenInput />
                  <Switch.Control />
                  <Switch.Label>If it does not fit, use relax time and late nights (never after the exam)</Switch.Label>
                </Switch.Root>
              </Stack>
            </Box>

            {/* Live check: does this plan fit? */}
            {parsed && preview && (
              <PlanPreview
                preview={preview}
                allowOvertime={draft.allowOvertime}
                open={showSessions}
                onToggle={() => setShowSessions((v) => !v)}
              />
            )}

            {!draft.id && (
              <Button type="button" size="sm" variant={draft.makePlan ? "subtle" : "outline"} colorPalette="teal" w="fit-content" onClick={() => setDraft({ ...draft, makePlan: !draft.makePlan })}>
                <LuSparkles /> {draft.makePlan ? "Study plan will be created" : "Create a study plan too"}
              </Button>
            )}
            {draft.id && !draftHasPlan && (
              <Button type="button" size="sm" variant={draft.makePlan ? "subtle" : "outline"} colorPalette="teal" w="fit-content" onClick={() => setDraft({ ...draft, makePlan: !draft.makePlan })}>
                <LuSparkles /> {draft.makePlan ? "Study plan will be created" : "Create a study plan too"}
              </Button>
            )}
            {draft.id && draftHasPlan && (
              <Text fontSize="xs" color="fg.muted">
                Saving updates the study plan automatically. Time you already worked is kept.
              </Text>
            )}
          </Stack>
        )}
      </FormDialog>
    </PageContainer>
  );
}

function PlanPreview({
  preview,
  allowOvertime,
  open,
  onToggle,
}: {
  preview: StudyPreview;
  allowOvertime: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  if (preview.empty) {
    return (
      <Box rounded="lg" borderWidth="1px" borderColor="red.muted" bg="red.subtle" p={3}>
        <Text fontSize="sm">There is not enough time before the exam to plan study sessions. Check the exam date.</Text>
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
      ? "Even with relax time and late nights there is no more room before the exam. Shorten a chapter, or move the exam time if it is wrong."
      : "Turn on the relax time / late night option below, or shorten a chapter.";
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
