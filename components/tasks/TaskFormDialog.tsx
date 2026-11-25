"use client";

import { Box, Button, Checkbox, HStack, IconButton, Input, Stack, Switch, Text, Textarea } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { LuMinus, LuPlus } from "react-icons/lu";
import { PlanPreview } from "@/components/PlanPreview";
import { FormField } from "@/components/Shared";
import { FormDialog } from "@/components/ui/FormDialog";
import { Select } from "@/components/ui/Select";
import { priorities, taskKinds } from "@/config/site";
import { usePlanner } from "@/context/PlannerContext";
import { formatDurationShort, parseDuration } from "@/lib/duration";
import { fmtDuration, fromDateAndTime, fromLocalInput, toDateInput, toLocalInput } from "@/lib/format";
import { toastPlan } from "@/lib/notify";
import { HOUR, MIN, addDays, atTime, legacyDoneMinutes, remainingMinutes, startOfDay, weekdayOf } from "@/lib/scheduler";
import type { Priority, Task, TaskKind } from "@/lib/types";

const chips = [15, 30, 45, 60, 90, 120, 180, 300, 480];

type Draft = {
  title: string;
  subjectId: string;
  kind: TaskKind;
  due: string; // datetime-local
  timeText: string; // what you typed for the estimate, e.g. "45m" or "1h30"
  worked: string; // minutes already worked (edit only)
  priority: Priority;
  notes: string;
  autoPlan: boolean;
  pin: boolean;
  pinDate: string;
  pinStart: string;
  pinEnd: string;
  startFrom: string; // "" = as soon as possible
  windowOn: boolean;
  winStart: string;
  winEnd: string;
  allowOvertime: boolean;
};

const windowPresets = [
  { label: "Morning", start: "08:00", end: "12:00" },
  { label: "Afternoon", start: "13:00", end: "17:00" },
  { label: "Evening", start: "17:00", end: "22:00" },
];

const hhmm = (ms: number) => toLocalInput(ms).slice(11, 16);

/** A sensible starting time for "when will I do it": the next full hour (or tomorrow morning). */
function defaultPin(now: number, minutes: number) {
  let start = Math.ceil((now + 5 * MIN) / HOUR) * HOUR;
  const hour = new Date(start).getHours();
  if (hour >= 22 || hour < 6) {
    // too late or too early: suggest 8 AM (today if it is still the early morning, otherwise tomorrow)
    const lateTonight = start >= atTime(startOfDay(now), "22:00");
    start = atTime(addDays(startOfDay(now), lateTonight ? 1 : 0), "08:00");
  }
  const end = start + Math.max(15, Math.min(minutes || 60, 120)) * MIN;
  return { pinDate: toDateInput(start), pinStart: hhmm(start), pinEnd: hhmm(end) };
}

function makeDraft(task: Task | null | undefined, workedMin: number, subjectId: string | undefined, now: number): Draft {
  if (task) {
    return {
      title: task.title,
      subjectId: task.subjectId || "",
      kind: task.kind,
      due: toLocalInput(Date.parse(task.dueAt)),
      timeText: formatDurationShort(task.estimateMin),
      worked: String(Math.round(workedMin)),
      priority: task.priority,
      notes: task.notes || "",
      autoPlan: true,
      pin: false,
      ...defaultPin(now, remainingMinutes(task, [])),
      startFrom: task.startAfter ? toLocalInput(Date.parse(task.startAfter)) : "",
      windowOn: !!task.window,
      winStart: task.window?.start || "08:00",
      winEnd: task.window?.end || "12:00",
      allowOvertime: task.allowOvertime !== false,
    };
  }
  return {
    title: "",
    subjectId: subjectId || "",
    kind: "assignment",
    due: toLocalInput(addDays(startOfDay(now), 3) + 23 * HOUR + 59 * MIN),
    timeText: "1h",
    worked: "0",
    priority: "medium",
    notes: "",
    autoPlan: true,
    pin: false,
    ...defaultPin(now, 60),
    startFrom: "",
    windowOn: false,
    winStart: "08:00",
    winEnd: "12:00",
    allowOvertime: true,
  };
}

/** Add / edit a task. The "how long will it take" question is required, the planner needs it. */
export function TaskFormDialog({
  open,
  onClose,
  task,
  defaultSubjectId,
}: {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  defaultSubjectId?: string;
}) {
  const { subjects, classes, blocks, settings, now, getSubject, addTask, updateTask, deleteTask, previewTaskPlan } = usePlanner();
  const [showSessions, setShowSessions] = useState(false);
  const legacy = task ? legacyDoneMinutes(task.id, blocks) : 0;
  const workedNow = task ? (task.loggedMin || 0) + legacy : 0;
  const [draft, setDraft] = useState<Draft>(() => makeDraft(task, workedNow, defaultSubjectId, Date.now()));

  // Start fresh every time the dialog opens.
  useEffect(() => {
    if (open) setDraft(makeDraft(task, workedNow, defaultSubjectId, Date.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, defaultSubjectId]);

  const total = parseDuration(draft.timeText) ?? 0;
  const workedInput = Math.round(Number(draft.worked));
  const dueMs = fromLocalInput(draft.due);
  const pinStartMs = fromDateAndTime(draft.pinDate, draft.pinStart);
  // An end time that is not later than the start (e.g. 22:00 to 00:00) means the next day.
  const pinEndSameDay = fromDateAndTime(draft.pinDate, draft.pinEnd);
  const pinOvernight = Number.isFinite(pinEndSameDay) && draft.pinEnd !== draft.pinStart && pinEndSameDay <= pinStartMs;
  const pinEndMs = pinOvernight ? pinEndSameDay + 24 * HOUR : pinEndSameDay;
  const pinValid = !draft.pin || (pinEndMs > pinStartMs && pinStartMs > now);
  const workedValid = !task || (Number.isFinite(workedInput) && workedInput >= 0);
  const valid = draft.title.trim().length > 0 && total >= 5 && Number.isFinite(dueMs) && pinValid && workedValid;

  // The scheduling options (same as for exams).
  const startFromMs = draft.startFrom ? fromLocalInput(draft.startFrom) : NaN;
  const options = {
    startAfter: Number.isFinite(startFromMs) && startFromMs > now ? new Date(startFromMs).toISOString() : null,
    window: draft.windowOn && draft.winStart && draft.winEnd ? { start: draft.winStart, end: draft.winEnd } : null,
    allowOvertime: draft.allowOvertime,
    // "Never after the deadline": lets the planner use relax time / late nights only when it must.
    // Exam tasks keep the limit their exam gave them.
    ...(task?.examId ? {} : { hardDueAt: draft.allowOvertime && Number.isFinite(dueMs) ? new Date(dueMs).toISOString() : null }),
  };

  // Live check: does it fit before the deadline?
  const preview = useMemo(() => {
    if (!open || total < 5 || !Number.isFinite(dueMs)) return null;
    return previewTaskPlan(
      {
        title: draft.title.trim() || "This task",
        subjectId: draft.subjectId || null,
        kind: draft.kind,
        dueAt: new Date(dueMs).toISOString(),
        estimateMin: total,
        loggedMin: task ? Math.max(0, (workedValid ? workedInput : 0)) : 0,
        priority: draft.priority,
        status: "todo",
        createdAt: new Date(now).toISOString(),
        completedAt: null,
        examId: task?.examId ?? null,
        ...(task?.examId ? { hardDueAt: task.hardDueAt ?? null } : {}),
        ...options,
      },
      { replaceTaskId: task?.id, pin: draft.pin && pinValid ? { start: pinStartMs, end: pinEndMs } : undefined },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft, total, dueMs, workedInput, workedValid, pinValid, pinStartMs, pinEndMs, task, previewTaskPlan, now]);

  // Tell the person if the time they picked sits on a class or a routine item (they may still keep it).
  const clashNames = useMemo(() => {
    if (!draft.pin || !pinValid) return [] as string[];
    const day = startOfDay(pinStartMs);
    const weekday = weekdayOf(day);
    const hits = (s: string, e: string) => pinStartMs < atTime(day, e) && pinEndMs > atTime(day, s);
    return [
      ...classes.filter((c) => c.day === weekday && hits(c.start, c.end)).map((c) => getSubject(c.subjectId)?.name || "a class"),
      ...settings.routine.filter((r) => r.days.includes(weekday) && hits(r.start, r.end)).map((r) => r.label),
    ];
  }, [draft.pin, pinValid, pinStartMs, pinEndMs, classes, settings.routine, getSubject]);

  const setTime = (minutes: number) => setDraft((d) => ({ ...d, timeText: formatDurationShort(minutes) }));
  const nudge = (delta: number) => setTime(Math.max(5, (parseDuration(draft.timeText) ?? 0) + delta));

  const submit = () => {
    if (!valid) return;
    const data = {
      title: draft.title.trim(),
      subjectId: draft.subjectId || null,
      kind: draft.kind,
      dueAt: new Date(dueMs).toISOString(),
      estimateMin: total,
      priority: draft.priority,
      notes: draft.notes.trim(),
      ...options,
    };
    const pin = draft.pin ? { start: pinStartMs, end: pinEndMs } : undefined;

    if (task) {
      const workedChanged = workedInput !== Math.round(workedNow);
      const optionsChanged =
        (task.startAfter ?? null) !== options.startAfter ||
        JSON.stringify(task.window ?? null) !== JSON.stringify(options.window) ||
        (task.allowOvertime !== false) !== options.allowOvertime;
      const changedPlan = data.estimateMin !== task.estimateMin || data.dueAt !== task.dueAt || workedChanged || optionsChanged;
      const patch = workedChanged ? { ...data, loggedMin: Math.max(0, workedInput - legacy) } : data;
      const plan = updateTask(task.id, patch, { replan: changedPlan && draft.autoPlan, pin });
      toastPlan(plan, pin ? "Preferred time saved and the rest re-planned" : "Task updated and re-planned");
    } else {
      const { plan } = addTask(data, { autoPlan: draft.autoPlan, pin });
      toastPlan(plan, "Task added");
    }
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={task ? "Edit task" : "New task"}
      onSubmit={submit}
      submitLabel={task ? "Save" : draft.autoPlan ? "Add and plan" : "Add"}
      submitDisabled={!valid}
      size="lg"
      footerLeft={
        task ? (
          <Button
            type="button"
            variant="ghost"
            colorPalette="red"
            onClick={() => {
              if (confirm(`Delete "${task.title}" and its planned sessions?`)) {
                deleteTask(task.id);
                onClose();
              }
            }}
          >
            Delete
          </Button>
        ) : undefined
      }
    >
      <Stack gap={4}>
        <FormField label="What do you need to do?">
          <Input autoFocus value={draft.title} placeholder="e.g. Math assignment 3" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </FormField>

        <HStack align="flex-start" gap={3} flexDirection={{ base: "column", sm: "row" }}>
          <FormField label="Subject">
            <Select
              value={draft.subjectId}
              onChange={(v) => setDraft({ ...draft, subjectId: v })}
              placeholder="No subject"
              options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            />
          </FormField>
          <FormField label="Type">
            <Select value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v as TaskKind })} options={taskKinds} />
          </FormField>
        </HStack>

        <FormField label="Deadline">
          <Input type="datetime-local" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} />
        </FormField>

        {/* Not wrapped in a form field on purpose: two inputs inside one field share an id and fight over focus. */}
        <Stack gap={2}>
          <Text fontWeight="medium" fontSize="sm">
            How long will it take?
          </Text>
          <HStack gap={2} wrap="wrap">
            {chips.map((m) => (
              <Button
                key={m}
                type="button"
                size="xs"
                variant={total === m ? "solid" : "outline"}
                colorPalette={total === m ? "teal" : undefined}
                onClick={() => setTime(m)}
              >
                {formatDurationShort(m)}
              </Button>
            ))}
          </HStack>
          <HStack gap={2}>
            <IconButton type="button" aria-label="5 minutes less" size="sm" variant="outline" onClick={() => nudge(-5)}>
              <LuMinus />
            </IconButton>
            <Input
              aria-label="Estimated time"
              value={draft.timeText}
              placeholder="e.g. 12, 45m, 1h30"
              maxW="40"
              onChange={(e) => setDraft({ ...draft, timeText: e.target.value })}
              onBlur={() => total >= 1 && setTime(total)}
            />
            <IconButton type="button" aria-label="5 minutes more" size="sm" variant="outline" onClick={() => nudge(5)}>
              <LuPlus />
            </IconButton>
            <Text fontSize="sm" color={total >= 5 ? "fg.muted" : "red.500"}>
              {total >= 5 ? `= ${fmtDuration(total)}` : "At least 5 minutes"}
            </Text>
          </HStack>
          <Text fontSize="xs" color="fg.muted">
            Any time works: type 12, 45m, 1h30 or 2.5h, or use − and + to change it by 5 minutes. The planner splits it into sessions in your free time.
          </Text>
        </Stack>

        {task && (
          <FormField label="Time already worked (minutes)" hint="Updated automatically by the focus timer and ticked sessions. You can correct it here.">
            <Input type="number" min={0} step={1} inputMode="numeric" value={draft.worked} onChange={(e) => setDraft({ ...draft, worked: e.target.value })} />
          </FormField>
        )}

        <FormField label="Priority">
          <Select value={draft.priority} onChange={(v) => setDraft({ ...draft, priority: v as Priority })} options={priorities} />
        </FormField>

        <FormField label="Notes (optional)">
          <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </FormField>

        <Box borderTopWidth="1px" pt={4}>
          <Text fontWeight="semibold" mb={3}>
            When to work on it
          </Text>
          <Stack gap={4}>
            <FormField label="Start working from" hint="Leave empty to start as soon as possible.">
              <Input type="datetime-local" value={draft.startFrom} onChange={(e) => setDraft({ ...draft, startFrom: e.target.value })} />
            </FormField>
            <HStack gap={2} wrap="wrap">
              <Button type="button" size="xs" variant="outline" onClick={() => setDraft({ ...draft, startFrom: toLocalInput(atTime(startOfDay(now), "19:00")) })}>
                Start tonight 19:00
              </Button>
              <Button type="button" size="xs" variant="outline" onClick={() => setDraft({ ...draft, startFrom: toLocalInput(atTime(addDays(startOfDay(now), 1), "08:00")) })}>
                Start tomorrow 08:00
              </Button>
              <Button type="button" size="xs" variant="ghost" onClick={() => setDraft({ ...draft, startFrom: "" })}>
                Clear
              </Button>
            </HStack>

            <Switch.Root colorPalette="teal" checked={draft.windowOn} onCheckedChange={(e) => setDraft({ ...draft, windowOn: e.checked })}>
              <Switch.HiddenInput />
              <Switch.Control />
              <Switch.Label>Prefer a time of day for the sessions</Switch.Label>
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
              <Switch.Label>If it does not fit, use relax time and late nights (never after the deadline)</Switch.Label>
            </Switch.Root>
          </Stack>
        </Box>

        {preview && (
          <PlanPreview preview={preview} allowOvertime={draft.allowOvertime} noun="deadline" open={showSessions} onToggle={() => setShowSessions((v) => !v)} />
        )}

        <Stack gap={3} p={3} borderWidth="1px" borderColor="border" rounded="lg">
          <Checkbox.Root colorPalette="teal" checked={draft.pin} onCheckedChange={(e) => setDraft({ ...draft, pin: !!e.checked })}>
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>{task ? "Choose a time I prefer to do it" : "I already know when I will do (part of) it"}</Checkbox.Label>
          </Checkbox.Root>
          {draft.pin && (
            <>
              <HStack gap={2} flexWrap="wrap">
                <Input type="date" w="auto" aria-label="Day" value={draft.pinDate} onChange={(e) => setDraft({ ...draft, pinDate: e.target.value })} />
                <Input type="time" w="auto" aria-label="From" value={draft.pinStart} onChange={(e) => setDraft({ ...draft, pinStart: e.target.value })} />
                <Text>to</Text>
                <Input type="time" w="auto" aria-label="To" value={draft.pinEnd} onChange={(e) => setDraft({ ...draft, pinEnd: e.target.value })} />
              </HStack>
              <HStack gap={2} wrap="wrap">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    const remaining = task ? Math.max(5, total - (workedValid ? workedInput : 0)) : total;
                    setDraft((d) => ({ ...d, pinEnd: hhmm(fromDateAndTime(d.pinDate, d.pinStart) + Math.max(5, remaining) * MIN) }));
                  }}
                >
                  Fill the time left
                </Button>
                <Text fontSize="xs" color="fg.muted">
                  This session stays exactly where you put it. The planner re-plans everything else around it, and any time left over is placed
                  automatically. Earlier fixed times are replaced if together they would be more than the time left.
                </Text>
              </HStack>
              {pinOvernight && pinValid && (
                <Text fontSize="xs" color="fg.muted">
                  Ends the next day ({new Date(pinEndMs).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}).
                </Text>
              )}
              {!pinValid && (
                <Text fontSize="sm" color="red.500">
                  Choose a start in the future and an end after the start.
                </Text>
              )}
              {clashNames.length > 0 && (
                <Text fontSize="sm" color="orange.500">
                  This time overlaps: {clashNames.join(", ")}. You can still keep it.
                </Text>
              )}
            </>
          )}
          <Checkbox.Root colorPalette="teal" checked={draft.autoPlan} onCheckedChange={(e) => setDraft({ ...draft, autoPlan: !!e.checked })}>
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>{task ? "Re-plan the other sessions when the deadline or time changes" : "Plan the rest in my free time automatically"}</Checkbox.Label>
          </Checkbox.Root>
        </Stack>
      </Stack>
    </FormDialog>
  );
}
