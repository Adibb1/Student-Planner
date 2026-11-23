"use client";

import { Badge, Box, Button, Card, HStack, IconButton, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuBookOpen, LuPencil, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { ColorDot, EmptyState, FormField, LoadingScreen, PageContainer, PageHeader } from "@/components/Shared";
import { DayPicker } from "@/components/ui/DayPicker";
import { FormDialog } from "@/components/ui/FormDialog";
import { subjectColors, weekdayLong } from "@/config/site";
import { usePlanner } from "@/context/PlannerContext";
import { fmtHHMM } from "@/lib/format";
import type { StudySlot, Subject, SubjectColor, Weekday } from "@/lib/types";

type Draft = { id?: string; name: string; code: string; color: SubjectColor; studySlots: StudySlot[] };

const blank = (index: number): Draft => ({
  name: "",
  code: "",
  color: subjectColors[index % subjectColors.length],
  studySlots: [],
});

export default function SubjectsPage() {
  const { loading, subjects, classes, tasks, addSubject, updateSubject, deleteSubject } = usePlanner();
  const [draft, setDraft] = useState<Draft | null>(null);

  if (loading) return <LoadingScreen />;

  const save = () => {
    if (!draft || !draft.name.trim()) return;
    const data = {
      name: draft.name.trim(),
      code: draft.code.trim() || undefined,
      color: draft.color,
      studySlots: draft.studySlots.filter((s) => s.end > s.start),
    };
    if (draft.id) updateSubject(draft.id, data);
    else addSubject(data as Omit<Subject, "id">);
    setDraft(null);
  };

  const setSlot = (i: number, patch: Partial<StudySlot>) =>
    setDraft((d) => d && { ...d, studySlots: d.studySlots.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  return (
    <PageContainer>
      <PageHeader
        title="Subjects"
        subtitle="Add each course once. You can also keep a weekly time just for a subject, e.g. Math homework every Wednesday 8-9 PM."
        actions={
          <Button colorPalette="teal" onClick={() => setDraft(blank(subjects.length))}>
            <LuPlus /> Add subject
          </Button>
        }
      />

      {subjects.length === 0 ? (
        <EmptyState
          icon={<LuBookOpen />}
          title="No subjects yet"
          text="Start with the courses you take this semester. Then add your classes and assignments."
          action={
            <Button colorPalette="teal" onClick={() => setDraft(blank(0))}>
              <LuPlus /> Add your first subject
            </Button>
          }
        />
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
          {subjects.map((s) => {
            const classCount = classes.filter((c) => c.subjectId === s.id).length;
            const open = tasks.filter((t) => t.subjectId === s.id && t.status === "todo").length;
            return (
              <Card.Root
                key={s.id}
                variant="outline"
                transition="all 0.2s"
                _hover={{ borderColor: "teal.500", transform: "translateY(-3px)" }}
              >
                <Card.Body gap={3}>
                  <HStack justify="space-between" align="flex-start">
                    <HStack gap={3} minW={0}>
                      <ColorDot color={s.color} size={4} />
                      <Stack gap={0} minW={0}>
                        <Card.Title fontSize="xl" truncate>
                          {s.name}
                        </Card.Title>
                        {s.code && (
                          <Text fontSize="sm" color="fg.muted">
                            {s.code}
                          </Text>
                        )}
                      </Stack>
                    </HStack>
                    <HStack gap={1}>
                      <IconButton
                        aria-label={`Edit ${s.name}`}
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft({ id: s.id, name: s.name, code: s.code || "", color: s.color, studySlots: s.studySlots || [] })
                        }
                      >
                        <LuPencil />
                      </IconButton>
                      <IconButton
                        aria-label={`Delete ${s.name}`}
                        size="sm"
                        variant="ghost"
                        colorPalette="red"
                        onClick={() => {
                          if (confirm(`Delete "${s.name}"? Its classes will be removed too. Tasks stay, without a subject.`)) deleteSubject(s.id);
                        }}
                      >
                        <LuTrash2 />
                      </IconButton>
                    </HStack>
                  </HStack>

                  <HStack gap={2} wrap="wrap">
                    <Badge colorPalette={s.color} variant="subtle">
                      {classCount} class{classCount === 1 ? "" : "es"} a week
                    </Badge>
                    <Badge variant="outline">{open} open task{open === 1 ? "" : "s"}</Badge>
                  </HStack>

                  {s.studySlots?.length > 0 && (
                    <Stack gap={1}>
                      <Text fontSize="xs" color="fg.muted">
                        Reserved study time
                      </Text>
                      {s.studySlots.map((slot, i) => (
                        <Text key={i} fontSize="sm">
                          {weekdayLong[slot.day]}, {fmtHHMM(slot.start)} – {fmtHHMM(slot.end)}
                        </Text>
                      ))}
                    </Stack>
                  )}
                </Card.Body>
              </Card.Root>
            );
          })}
        </SimpleGrid>
      )}

      <FormDialog
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit subject" : "New subject"}
        onSubmit={save}
        submitDisabled={!draft?.name.trim()}
      >
        {draft && (
          <Stack gap={4}>
            <FormField label="Subject name">
              <Input autoFocus value={draft.name} placeholder="e.g. Mathematics" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </FormField>
            <FormField label="Course code (optional)">
              <Input value={draft.code} placeholder="e.g. TK1013" onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
            </FormField>
            <FormField label="Colour">
              <HStack gap={2} wrap="wrap">
                {subjectColors.map((c) => (
                  <Box
                    key={c}
                    asChild
                    colorPalette={c}
                    boxSize="8"
                    rounded="full"
                    bg="colorPalette.solid"
                    borderWidth="3px"
                    borderColor={draft.color === c ? "fg" : "transparent"}
                    cursor="pointer"
                  >
                    <button type="button" aria-label={c} aria-pressed={draft.color === c} onClick={() => setDraft({ ...draft, color: c })} />
                  </Box>
                ))}
              </HStack>
            </FormField>

            <FormField
              label="Reserved study time (optional)"
              hint="The planner uses this time first for this subject's tasks. Example: Wednesday 08:00 – 09:00."
            >
              <Stack gap={3} w="full">
                {draft.studySlots.map((slot, i) => (
                  <Stack key={i} gap={2} p={3} borderWidth="1px" borderColor="border" rounded="lg">
                    <HStack justify="space-between">
                      <DayPicker single value={[slot.day]} onChange={(d) => setSlot(i, { day: d[0] as Weekday })} />
                      <IconButton
                        aria-label="Remove this time"
                        size="xs"
                        variant="ghost"
                        onClick={() => setDraft({ ...draft, studySlots: draft.studySlots.filter((_, k) => k !== i) })}
                      >
                        <LuX />
                      </IconButton>
                    </HStack>
                    <HStack>
                      <Input type="time" value={slot.start} onChange={(e) => setSlot(i, { start: e.target.value })} />
                      <Text>to</Text>
                      <Input type="time" value={slot.end} onChange={(e) => setSlot(i, { end: e.target.value })} />
                    </HStack>
                  </Stack>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  w="fit-content"
                  onClick={() => setDraft({ ...draft, studySlots: [...draft.studySlots, { day: 3, start: "20:00", end: "21:00" }] })}
                >
                  <LuPlus /> Add a weekly time
                </Button>
              </Stack>
            </FormField>
          </Stack>
        )}
      </FormDialog>
    </PageContainer>
  );
}
