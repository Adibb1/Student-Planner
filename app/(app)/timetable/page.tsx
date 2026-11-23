"use client";

import { Badge, Box, Button, ButtonGroup, Grid, HStack, IconButton, Input, Stack, Tabs, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useMemo, useState } from "react";
import { LuChevronLeft, LuChevronRight, LuPencil, LuPlus } from "react-icons/lu";
import { AgendaRow } from "@/components/AgendaRow";
import { EmptyState, FormField, LoadingScreen, PageContainer, PageHeader, SectionCard } from "@/components/Shared";
import { DayPicker } from "@/components/ui/DayPicker";
import { FormDialog } from "@/components/ui/FormDialog";
import { Select } from "@/components/ui/Select";
import { classKinds, weekOrder, weekdayLong, weekdayShort } from "@/config/site";
import { usePlanner } from "@/context/PlannerContext";
import { buildDayItems, itemColor, startOfWeek } from "@/lib/agenda";
import { fmtDate, fmtHHMM } from "@/lib/format";
import { addDays, startOfDay, weekdayOf } from "@/lib/scheduler";
import type { ClassKind, ClassSession, Weekday } from "@/lib/types";

type Draft = {
  id?: string;
  subjectId: string;
  days: Weekday[];
  start: string;
  end: string;
  room: string;
  kind: ClassKind;
};

const blank = (subjectId = "", day: Weekday = 1): Draft => ({
  subjectId,
  days: [day],
  start: "08:00",
  end: "10:00",
  room: "",
  kind: "lecture",
});

export default function TimetablePage() {
  const { loading, now, settings, subjects, classes, blocks, tasks, getSubject, addClass, updateClass, deleteClass } =
    usePlanner();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()));
  const [view, setView] = useState<"week" | "classes">("week");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dayTab, setDayTab] = useState<string>(String(weekdayOf(startOfDay(Date.now()))));

  const ctx = useMemo(
    () => ({ settings, classes, blocks, tasks, subjects, now }),
    [settings, classes, blocks, tasks, subjects, now],
  );
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  if (loading) return <LoadingScreen />;

  const todayStart = startOfDay(now);
  const save = () => {
    if (!draft || !draft.subjectId || draft.end <= draft.start || draft.days.length === 0) return;
    if (draft.id) {
      updateClass(draft.id, {
        subjectId: draft.subjectId,
        day: draft.days[0],
        start: draft.start,
        end: draft.end,
        room: draft.room.trim() || undefined,
        kind: draft.kind,
      });
    } else {
      for (const day of draft.days) {
        addClass({
          subjectId: draft.subjectId,
          day,
          start: draft.start,
          end: draft.end,
          room: draft.room.trim() || undefined,
          kind: draft.kind,
        });
      }
    }
    setDraft(null);
  };

  const editClass = (c: ClassSession) =>
    setDraft({ id: c.id, subjectId: c.subjectId, days: [c.day], start: c.start, end: c.end, room: c.room || "", kind: c.kind });

  const noSubjects = subjects.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Timetable"
        subtitle="Your fixed weekly classes, with your meals, prayer and relax time, and the study sessions planned for you."
        actions={
          <Button colorPalette="teal" disabled={noSubjects} onClick={() => setDraft(blank(subjects[0]?.id))}>
            <LuPlus /> Add class
          </Button>
        }
      />

      {noSubjects ? (
        <EmptyState
          title="Add a subject first"
          text="Classes belong to a subject. Create your subjects, then come back to build your timetable."
          action={
            <Button asChild colorPalette="teal">
              <NextLink href="/subjects">Go to subjects</NextLink>
            </Button>
          }
        />
      ) : (
        <>
          <HStack justify="space-between" mb={4} wrap="wrap" gap={3}>
            <ButtonGroup size="sm" attached variant="outline">
              <Button variant={view === "week" ? "subtle" : "outline"} colorPalette={view === "week" ? "teal" : undefined} onClick={() => setView("week")}>
                Week
              </Button>
              <Button variant={view === "classes" ? "subtle" : "outline"} colorPalette={view === "classes" ? "teal" : undefined} onClick={() => setView("classes")}>
                My classes
              </Button>
            </ButtonGroup>
            {view === "week" && (
              <HStack gap={1}>
                <IconButton aria-label="Previous week" size="sm" variant="outline" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                  <LuChevronLeft />
                </IconButton>
                <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(Date.now()))}>
                  {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))}
                </Button>
                <IconButton aria-label="Next week" size="sm" variant="outline" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                  <LuChevronRight />
                </IconButton>
              </HStack>
            )}
          </HStack>

          {view === "week" ? (
            <>
              {/* Phones: one day at a time */}
              <Box display={{ base: "block", lg: "none" }}>
                <Tabs.Root value={dayTab} onValueChange={(e) => setDayTab(e.value)} variant="subtle" colorPalette="teal" size="sm" fitted>
                  <Tabs.List>
                    {days.map((d) => (
                      <Tabs.Trigger key={d} value={String(weekdayOf(d))}>
                        {weekdayShort[weekdayOf(d)]}
                      </Tabs.Trigger>
                    ))}
                  </Tabs.List>
                  {days.map((d) => (
                    <Tabs.Content key={d} value={String(weekdayOf(d))} pt={4}>
                      <Stack gap={2}>
                        {buildDayItems(d, ctx).map((item) => (
                          <AgendaRow key={item.id} item={item} />
                        ))}
                      </Stack>
                    </Tabs.Content>
                  ))}
                </Tabs.Root>
              </Box>

              {/* Laptops: whole week */}
              <Grid display={{ base: "none", lg: "grid" }} templateColumns="repeat(7, minmax(0, 1fr))" gap={3} alignItems="start">
                {days.map((d) => {
                  const items = buildDayItems(d, ctx).filter((i) => i.kind !== "routine");
                  const isToday = d === todayStart;
                  return (
                    <Stack key={d} gap={2}>
                      <Box
                        textAlign="center"
                        py={2}
                        rounded="lg"
                        bg={isToday ? "teal.500" : "bg.muted"}
                        color={isToday ? "white" : "fg"}
                      >
                        <Text fontSize="xs" opacity={0.85}>
                          {weekdayShort[weekdayOf(d)]}
                        </Text>
                        <Text fontWeight="bold">{new Date(d).getDate()}</Text>
                      </Box>
                      {items.length === 0 && (
                        <Text fontSize="xs" color="fg.muted" textAlign="center" py={3}>
                          Free
                        </Text>
                      )}
                      {items.map((item) => {
                        const color = itemColor(item, subjects);
                        return (
                          <Box
                            key={item.id}
                            colorPalette={color}
                            p={2}
                            rounded="md"
                            bg={item.kind === "study" ? "transparent" : "colorPalette.subtle"}
                            borderWidth="1px"
                            borderStyle={item.kind === "study" ? "dashed" : "solid"}
                            borderColor={item.kind === "study" ? "colorPalette.solid" : "transparent"}
                            borderLeftWidth="4px"
                            borderLeftColor="colorPalette.solid"
                            opacity={item.done ? 0.55 : 1}
                          >
                            <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap">
                              {new Date(item.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </Text>
                            <Text fontSize="sm" fontWeight="medium" lineClamp={2} textDecoration={item.done ? "line-through" : undefined}>
                              {item.title}
                            </Text>
                            {item.kind === "study" && (
                              <Badge size="xs" colorPalette={item.missed ? "red" : color} variant="subtle" mt={1}>
                                {item.missed ? "Missed" : "Study"}
                              </Badge>
                            )}
                            {item.kind === "class" && item.subtitle && (
                              <Text fontSize="xs" color="fg.muted" truncate>
                                {item.subtitle}
                              </Text>
                            )}
                          </Box>
                        );
                      })}
                    </Stack>
                  );
                })}
              </Grid>
              <Text fontSize="xs" color="fg.muted" mt={4}>
                Meals, prayer and relax time are hidden here to keep the week readable. They are still protected from
                study, and you can see them on the Today page and in the phone view.
              </Text>
            </>
          ) : (
            <Stack gap={6}>
              {classes.length === 0 ? (
                <EmptyState
                  title="No classes yet"
                  text="Add each class once and it repeats every week."
                  action={
                    <Button colorPalette="teal" onClick={() => setDraft(blank(subjects[0]?.id))}>
                      <LuPlus /> Add your first class
                    </Button>
                  }
                />
              ) : (
                weekOrder.map((day) => {
                  const list = classes.filter((c) => c.day === day).sort((a, b) => a.start.localeCompare(b.start));
                  if (list.length === 0) return null;
                  return (
                    <SectionCard key={day} title={weekdayLong[day]}>
                      <Stack gap={2}>
                        {list.map((c) => {
                          const s = getSubject(c.subjectId);
                          return (
                            <HStack
                              key={c.id}
                              colorPalette={s?.color || "gray"}
                              p={3}
                              rounded="lg"
                              bg="colorPalette.subtle"
                              borderLeftWidth="4px"
                              borderLeftColor="colorPalette.solid"
                              justify="space-between"
                              gap={3}
                            >
                              <Stack gap={0} minW={0}>
                                <Text fontWeight="medium" truncate>
                                  {s?.name || "Class"}
                                </Text>
                                <Text fontSize="sm" color="fg.muted">
                                  {fmtHHMM(c.start)} – {fmtHHMM(c.end)} · {classKinds.find((k) => k.value === c.kind)?.label}
                                  {c.room ? ` · ${c.room}` : ""}
                                </Text>
                              </Stack>
                              <IconButton aria-label="Edit class" size="sm" variant="ghost" onClick={() => editClass(c)}>
                                <LuPencil />
                              </IconButton>
                            </HStack>
                          );
                        })}
                      </Stack>
                    </SectionCard>
                  );
                })
              )}
            </Stack>
          )}
        </>
      )}

      <FormDialog
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit class" : "New class"}
        onSubmit={save}
        submitDisabled={!draft || !draft.subjectId || draft.end <= draft.start || draft.days.length === 0}
        footerLeft={
          draft?.id ? (
            <Button
              type="button"
              variant="ghost"
              colorPalette="red"
              onClick={() => {
                if (draft.id && confirm("Delete this class?")) {
                  deleteClass(draft.id);
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
            <FormField label="Subject">
              <Select
                value={draft.subjectId}
                onChange={(v) => setDraft({ ...draft, subjectId: v })}
                options={subjects.map((s) => ({ value: s.id, label: s.name }))}
              />
            </FormField>
            <FormField label={draft.id ? "Day" : "Day(s)"} hint={draft.id ? undefined : "Pick more than one if the same class repeats on several days."}>
              <DayPicker value={draft.days} single={!!draft.id} onChange={(days) => setDraft({ ...draft, days })} />
            </FormField>
            <HStack align="flex-start">
              <FormField label="Starts">
                <Input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
              </FormField>
              <FormField label="Ends">
                <Input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
              </FormField>
            </HStack>
            <HStack align="flex-start">
              <FormField label="Type">
                <Select value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v as ClassKind })} options={classKinds} />
              </FormField>
              <FormField label="Room (optional)">
                <Input value={draft.room} placeholder="e.g. Lab 3" onChange={(e) => setDraft({ ...draft, room: e.target.value })} />
              </FormField>
            </HStack>
            {draft.end <= draft.start && (
              <Text fontSize="sm" color="red.500">
                The end time must be after the start time.
              </Text>
            )}
          </Stack>
        )}
      </FormDialog>
    </PageContainer>
  );
}
