"use client";

import { Button, Checkbox, HStack, Input, NumberInput, Stack, Text, Textarea } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { FormField } from "@/components/Shared";
import { FormDialog } from "@/components/ui/FormDialog";
import { Select } from "@/components/ui/Select";
import { estimateChips, priorities, taskKinds } from "@/config/site";
import { usePlanner } from "@/context/PlannerContext";
import { fromDateAndTime, fromLocalInput, fmtDuration, toDateInput, toLocalInput } from "@/lib/format";
import { toastPlan } from "@/lib/notify";
import { HOUR, addDays, startOfDay } from "@/lib/scheduler";
import type { Priority, Task, TaskKind } from "@/lib/types";

type Draft = {
  title: string;
  subjectId: string;
  kind: TaskKind;
  due: string; // datetime-local
  hours: number;
  minutes: number;
  priority: Priority;
  notes: string;
  autoPlan: boolean;
  pin: boolean;
  pinDate: string;
  pinStart: string;
  pinEnd: string;
};

function makeDraft(task: Task | null | undefined, subjectId: string | undefined, now: number): Draft {
  if (task) {
    return {
      title: task.title,
      subjectId: task.subjectId || "",
      kind: task.kind,
      due: toLocalInput(Date.parse(task.dueAt)),
      hours: Math.floor(task.estimateMin / 60),
      minutes: task.estimateMin % 60,
      priority: task.priority,
      notes: task.notes || "",
      autoPlan: true,
      pin: false,
      pinDate: toDateInput(now),
      pinStart: "20:00",
      pinEnd: "21:00",
    };
  }
  const due = addDays(startOfDay(now), 3) + 23 * HOUR + 59 * 60_000;
  return {
    title: "",
    subjectId: subjectId || "",
    kind: "assignment",
    due: toLocalInput(due),
    hours: 1,
    minutes: 0,
    priority: "medium",
    notes: "",
    autoPlan: true,
    pin: false,
    pinDate: toDateInput(addDays(startOfDay(now), 1)),
    pinStart: "20:00",
    pinEnd: "21:00",
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
  const { subjects, now, addTask, updateTask, deleteTask } = usePlanner();
  const [draft, setDraft] = useState<Draft>(() => makeDraft(task, defaultSubjectId, Date.now()));

  // Start fresh every time the dialog opens.
  useEffect(() => {
    if (open) setDraft(makeDraft(task, defaultSubjectId, Date.now()));
  }, [open, task, defaultSubjectId]);

  const total = draft.hours * 60 + draft.minutes;
  const dueMs = fromLocalInput(draft.due);
  const pinStartMs = fromDateAndTime(draft.pinDate, draft.pinStart);
  const pinEndMs = fromDateAndTime(draft.pinDate, draft.pinEnd);
  const pinValid = !draft.pin || (pinEndMs > pinStartMs && pinStartMs > now);
  const valid = draft.title.trim().length > 0 && total >= 5 && Number.isFinite(dueMs) && pinValid;

  const setTotal = (minutes: number) => setDraft((d) => ({ ...d, hours: Math.floor(minutes / 60), minutes: minutes % 60 }));

  const submit = () => {
    if (!valid) return;
    const data = {
      title: draft.title.trim(),
      subjectId: draft.subjectId || null,
      kind: draft.kind,
      dueAt: new Date(dueMs).toISOString(),
      estimateMin: total,
      priority: draft.priority,
      notes: draft.notes.trim() || undefined,
    };
    if (task) {
      const changedPlan = data.estimateMin !== task.estimateMin || data.dueAt !== task.dueAt;
      toastPlan(updateTask(task.id, data, { replan: changedPlan && draft.autoPlan }), "Task updated and re-planned");
    } else {
      const { plan } = addTask(data, {
        autoPlan: draft.autoPlan,
        pin: draft.pin ? { start: pinStartMs, end: pinEndMs } : undefined,
      });
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

        <FormField
          label="How long will it take?"
          hint="Your best guess for the total work. The planner splits it into sessions and fits them into your free time."
        >
          <Stack gap={3} w="full">
            <HStack gap={2} wrap="wrap">
              {estimateChips.map((c) => (
                <Button
                  key={c.minutes}
                  type="button"
                  size="xs"
                  variant={total === c.minutes ? "solid" : "outline"}
                  colorPalette={total === c.minutes ? "teal" : undefined}
                  onClick={() => setTotal(c.minutes)}
                >
                  {c.label}
                </Button>
              ))}
            </HStack>
            <HStack gap={2}>
              <NumberInput.Root min={0} max={99} value={String(draft.hours)} onValueChange={(e) => setDraft({ ...draft, hours: Number(e.value) || 0 })} w="24">
                <NumberInput.Input aria-label="Hours" />
              </NumberInput.Root>
              <Text>h</Text>
              <NumberInput.Root min={0} max={55} step={5} value={String(draft.minutes)} onValueChange={(e) => setDraft({ ...draft, minutes: Math.min(59, Number(e.value) || 0) })} w="24">
                <NumberInput.Input aria-label="Minutes" />
              </NumberInput.Root>
              <Text>min</Text>
              {total >= 5 && (
                <Text fontSize="sm" color="fg.muted">
                  = {fmtDuration(total)}
                </Text>
              )}
            </HStack>
            {total < 5 && (
              <Text fontSize="sm" color="red.500">
                Enter at least 5 minutes.
              </Text>
            )}
          </Stack>
        </FormField>

        <FormField label="Priority">
          <Select value={draft.priority} onChange={(v) => setDraft({ ...draft, priority: v as Priority })} options={priorities} />
        </FormField>

        <FormField label="Notes (optional)">
          <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </FormField>

        {!task && (
          <Stack gap={3} p={3} borderWidth="1px" borderColor="border" rounded="lg">
            <Checkbox.Root colorPalette="teal" checked={draft.pin} onCheckedChange={(e) => setDraft({ ...draft, pin: !!e.checked })}>
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>I already know when I will do (part of) it</Checkbox.Label>
            </Checkbox.Root>
            {draft.pin && (
              <>
                <HStack gap={2} flexWrap="wrap">
                  <Input type="date" w="auto" value={draft.pinDate} onChange={(e) => setDraft({ ...draft, pinDate: e.target.value })} />
                  <Input type="time" w="auto" value={draft.pinStart} onChange={(e) => setDraft({ ...draft, pinStart: e.target.value })} />
                  <Text>to</Text>
                  <Input type="time" w="auto" value={draft.pinEnd} onChange={(e) => setDraft({ ...draft, pinEnd: e.target.value })} />
                </HStack>
                <Text fontSize="xs" color="fg.muted">
                  This session stays exactly where you put it. Any time left over is planned automatically.
                </Text>
                {!pinValid && (
                  <Text fontSize="sm" color="red.500">
                    Choose a start in the future and an end after the start.
                  </Text>
                )}
              </>
            )}
            <Checkbox.Root colorPalette="teal" checked={draft.autoPlan} onCheckedChange={(e) => setDraft({ ...draft, autoPlan: !!e.checked })}>
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label>Plan the rest in my free time automatically</Checkbox.Label>
            </Checkbox.Root>
          </Stack>
        )}
        {task && (
          <Checkbox.Root colorPalette="teal" checked={draft.autoPlan} onCheckedChange={(e) => setDraft({ ...draft, autoPlan: !!e.checked })}>
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>Re-plan sessions if the deadline or time estimate changed</Checkbox.Label>
          </Checkbox.Root>
        )}
      </Stack>
    </FormDialog>
  );
}
