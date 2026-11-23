"use client";

import { Button, ButtonGroup, HStack, Stack, Text } from "@chakra-ui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { LuListChecks, LuPlus, LuRefreshCw, LuSparkles } from "react-icons/lu";
import { EmptyState, LoadingScreen, PageContainer, PageHeader } from "@/components/Shared";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog";
import { Select } from "@/components/ui/Select";
import { usePlanner } from "@/context/PlannerContext";
import { toastPlan } from "@/lib/notify";
import { isOverdue } from "@/lib/scheduler";
import type { Task } from "@/lib/types";

type Filter = "todo" | "overdue" | "done";

function TasksContent() {
  const { loading, now, tasks, subjects, alerts, autoSchedule, rescheduleMissedWork } = usePlanner();
  const params = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("todo");
  const [subject, setSubject] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // "/tasks?new=1" (from the Today page) opens the form straight away.
  useEffect(() => {
    if (params.get("new")) {
      setEditing(null);
      setFormOpen(true);
      router.replace("/tasks");
    }
  }, [params, router]);

  const counts = useMemo(
    () => ({
      todo: tasks.filter((t) => t.status === "todo").length,
      overdue: tasks.filter((t) => isOverdue(t, now)).length,
      done: tasks.filter((t) => t.status === "done").length,
    }),
    [tasks, now],
  );

  const list = useMemo(() => {
    const bySubject = (t: Task) => !subject || t.subjectId === subject;
    if (filter === "done") {
      return tasks
        .filter((t) => t.status === "done" && bySubject(t))
        .sort((a, b) => Date.parse(b.completedAt || b.createdAt) - Date.parse(a.completedAt || a.createdAt));
    }
    return tasks
      .filter((t) => t.status === "todo" && bySubject(t) && (filter === "todo" || isOverdue(t, now)))
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  }, [tasks, filter, subject, now]);

  if (loading) return <LoadingScreen />;

  const open = (task: Task | null) => {
    setEditing(task);
    setFormOpen(true);
  };

  const tab = (value: Filter, label: string, count: number) => (
    <Button
      variant={filter === value ? "subtle" : "outline"}
      colorPalette={filter === value ? "teal" : undefined}
      onClick={() => setFilter(value)}
    >
      {label} ({count})
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Tasks"
        subtitle="Assignments, projects and study sessions. Each one has a deadline and a time estimate, so the planner can fit it into your week."
        actions={
          <>
            {alerts.missed.length > 0 && (
              <Button variant="outline" colorPalette="orange" onClick={() => toastPlan(rescheduleMissedWork(), "Missed sessions rescheduled")}>
                <LuRefreshCw /> Reschedule missed ({alerts.missed.length})
              </Button>
            )}
            <Button variant="outline" onClick={() => toastPlan(autoSchedule("full"), "Week re-planned")}>
              <LuSparkles /> Re-plan my week
            </Button>
            <Button colorPalette="teal" onClick={() => open(null)}>
              <LuPlus /> Add task
            </Button>
          </>
        }
      />

      <Stack gap={4}>
        <HStack justify="space-between" wrap="wrap" gap={3}>
          <ButtonGroup size="sm" attached>
            {tab("todo", "To do", counts.todo)}
            {tab("overdue", "Overdue", counts.overdue)}
            {tab("done", "Done", counts.done)}
          </ButtonGroup>
          {subjects.length > 0 && (
            <Stack w={{ base: "full", sm: "56" }}>
              <Select
                size="sm"
                value={subject}
                onChange={setSubject}
                placeholder="All subjects"
                options={subjects.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Stack>
          )}
        </HStack>

        {list.length === 0 ? (
          <EmptyState
            icon={<LuListChecks />}
            title={filter === "done" ? "Nothing finished yet" : filter === "overdue" ? "Nothing overdue" : "No tasks to do"}
            text={
              filter === "todo"
                ? "Add an assignment with its deadline and how long it takes. The planner will find time for it."
                : undefined
            }
            action={
              filter === "todo" ? (
                <Button colorPalette="teal" onClick={() => open(null)}>
                  <LuPlus /> Add a task
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Stack gap={4}>
            {list.map((t) => (
              <TaskCard key={t.id} task={t} onEdit={open} />
            ))}
          </Stack>
        )}
        {filter === "todo" && list.length > 0 && (
          <Text fontSize="xs" color="fg.muted">
            Tip: tick a session when you finish it. If you skip one, use Reschedule missed and it moves to your next free time.
          </Text>
        )}
      </Stack>

      <TaskFormDialog open={formOpen} onClose={() => setFormOpen(false)} task={editing} />
    </PageContainer>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <TasksContent />
    </Suspense>
  );
}
