"use client";

// The brain of the app on the screen side:
//   • listens to your data in Firestore (live – changes on your phone appear on your laptop)
//   • offers actions (add task, auto-schedule, reschedule missed work...) that pages can call
//
// Pages never talk to Firestore directly, they only use usePlanner().

import type { User } from "firebase/auth";
import { type WriteBatch, increment, limit, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { defaultSettings } from "@/config/defaults";
import { toaster } from "@/components/ui/toaster";
import { useNow } from "@/hooks/useNow";
import { findClashes } from "@/lib/agenda";
import {
  applyPlan,
  colRef,
  createDoc,
  deleteTasksCascade,
  newId,
  patchDoc,
  removeDoc,
  runBatched,
  setDocWithId,
  setWriteErrorHandler,
  userRef,
  docRef,
} from "@/lib/db";
import {
  DAY,
  MIN,
  type PlanMode,
  type PlanResult,
  blockMinutes,
  buildStudyTasks,
  isMissed,
  isOverdue,
  planSchedule,
  remainingMinutes,
  rescheduleMissed,
  startOfDay,
} from "@/lib/scheduler";
import { mergeSettings } from "@/lib/settings";
import type {
  Block,
  ClassSession,
  Exam,
  FocusLog,
  Settings,
  Subject,
  Task,
} from "@/lib/types";

/** Minutes of work to save, sent by the focus timer. */
export type ProgressEntry = {
  /** One id per timer round, so a round saved several times stays one entry. */
  runId: string;
  taskId: string | null;
  blockId: string | null;
  minutes: number;
  kind: "focus" | "break";
  /** Add the minutes to the task's progress (breaks can be left out in Settings). */
  creditTask: boolean;
  /** The timer stopped or finished, so tidy up the plan too. */
  settle: boolean;
};

export type TaskInput = Pick<Task, "title" | "subjectId" | "kind" | "dueAt" | "estimateMin" | "priority"> & {
  notes?: string;
};

export type PlanSummary = {
  placed: number;
  moved: number;
  /** Tasks that could not fit before their deadline. */
  short: { task: Task; missingMin: number }[];
};

type Alerts = {
  missed: Block[];
  overdue: Task[];
  dueToday: Task[];
  clashes: Block[];
};

type PlannerState = {
  loading: boolean;
  now: number;
  uid: string;
  settings: Settings;
  subjects: Subject[];
  classes: ClassSession[];
  tasks: Task[];
  blocks: Block[];
  exams: Exam[];
  focusLogs: FocusLog[];
  alerts: Alerts;
  getSubject: (id?: string | null) => Subject | undefined;
  getTask: (id?: string | null) => Task | undefined;

  saveSettings: (next: Settings) => void;

  addSubject: (data: Omit<Subject, "id">) => string;
  updateSubject: (id: string, patch: Partial<Omit<Subject, "id">>) => void;
  deleteSubject: (id: string) => void;

  addClass: (data: Omit<ClassSession, "id">) => string;
  updateClass: (id: string, patch: Partial<Omit<ClassSession, "id">>) => void;
  deleteClass: (id: string) => void;

  addTask: (input: TaskInput, opts?: { pin?: { start: number; end: number }; autoPlan?: boolean }) => { id: string; plan: PlanSummary | null };
  updateTask: (
    id: string,
    patch: Partial<TaskInput> & { loggedMin?: number },
    opts?: { replan?: boolean; pin?: { start: number; end: number } },
  ) => PlanSummary | null;
  completeTask: (id: string) => void;
  reopenTask: (id: string) => PlanSummary | null;
  deleteTask: (id: string) => void;

  toggleBlockDone: (blockId: string) => void;
  toggleBlockLock: (blockId: string) => void;
  deleteBlock: (blockId: string) => void;
  addSession: (taskId: string, start: number, end: number) => void;

  addExam: (data: Omit<Exam, "id">) => string;
  updateExam: (id: string, patch: Partial<Omit<Exam, "id">>) => void;
  deleteExam: (id: string) => void;
  generateStudyPlan: (examId: string, examOverride?: Exam) => { tasks: number; plan: PlanSummary | null };

  addProgress: (entry: ProgressEntry) => void;

  autoSchedule: (mode?: PlanMode) => PlanSummary;
  rescheduleMissedWork: () => PlanSummary;
};

const PlannerContext = createContext<PlannerState | null>(null);

const withId = <T,>(snap: { docs: { id: string; data: () => unknown }[] }): T[] =>
  snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as T);

export function PlannerProvider({ user, children }: { user: User; children: ReactNode }) {
  const uid = user.uid;
  const now = useNow(30_000);

  const [loadedCount, setLoadedCount] = useState(0);
  const [settings, setSettings] = useState<Settings>(() => defaultSettings());
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [focusLogs, setFocusLogs] = useState<FocusLog[]>([]);

  // Always-fresh copy of the data for actions that run right after a write.
  const stateRef = useRef({ settings, subjects, classes, tasks, blocks, exams });
  stateRef.current = { settings, subjects, classes, tasks, blocks, exams };

  // Show a message if a save is refused by the server.
  useEffect(() => {
    setWriteErrorHandler((error) => {
      console.error(error);
      toaster.create({
        type: "error",
        title: "Could not save",
        description: "Your change was not saved. Check your internet connection and try again.",
      });
    });
  }, []);

  // ── Live data ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const seen = new Set<string>();
    const markLoaded = (name: string) => {
      if (!seen.has(name)) {
        seen.add(name);
        setLoadedCount(seen.size);
      }
    };
    const fail = (name: string) => (err: unknown) => {
      console.error(`Could not load ${name}`, err);
      markLoaded(name);
    };

    const unsubs = [
      onSnapshot(
        userRef(uid),
        (snap) => {
          if (!snap.exists()) {
            if (!snap.metadata.fromCache) {
              const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
              setDoc(
                userRef(uid),
                {
                  displayName: user.displayName || "",
                  email: user.email || "",
                  photoURL: user.photoURL || "",
                  createdAt: new Date().toISOString(),
                  notifyEnabled: false,
                  settings: defaultSettings(tz),
                },
                { merge: true },
              ).catch((e) => console.error(e));
            }
          } else {
            setSettings(mergeSettings(snap.data().settings));
          }
          markLoaded("user");
        },
        fail("user"),
      ),
      onSnapshot(colRef(uid, "subjects"), (s) => { setSubjects(withId<Subject>(s)); markLoaded("subjects"); }, fail("subjects")),
      onSnapshot(colRef(uid, "classes"), (s) => { setClasses(withId<ClassSession>(s)); markLoaded("classes"); }, fail("classes")),
      onSnapshot(colRef(uid, "tasks"), (s) => { setTasks(withId<Task>(s)); markLoaded("tasks"); }, fail("tasks")),
      onSnapshot(colRef(uid, "blocks"), (s) => { setBlocks(withId<Block>(s)); markLoaded("blocks"); }, fail("blocks")),
      onSnapshot(colRef(uid, "exams"), (s) => { setExams(withId<Exam>(s)); markLoaded("exams"); }, fail("exams")),
      onSnapshot(
        query(colRef(uid, "focusLogs"), orderBy("at", "desc"), limit(300)),
        (s) => { setFocusLogs(withId<FocusLog>(s)); markLoaded("focusLogs"); },
        fail("focusLogs"),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid, user.displayName, user.email, user.photoURL]);

  // ── Lookups & alerts ───────────────────────────────────────────────────────────────
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const getSubject = useCallback((id?: string | null) => (id ? subjectMap.get(id) : undefined), [subjectMap]);
  const getTask = useCallback((id?: string | null) => (id ? taskMap.get(id) : undefined), [taskMap]);

  const alerts = useMemo<Alerts>(() => {
    const endOfToday = startOfDay(now) + DAY;
    const todo = tasks.filter((t) => t.status === "todo");
    return {
      missed: blocks.filter((b) => isMissed(b, now) && taskMap.get(b.taskId)?.status === "todo"),
      overdue: todo.filter((t) => isOverdue(t, now)),
      dueToday: todo.filter((t) => {
        const due = Date.parse(t.dueAt);
        return due >= now && due < endOfToday;
      }),
      clashes: findClashes({ settings, classes, blocks, tasks, subjects, now }),
    };
  }, [blocks, tasks, taskMap, settings, classes, subjects, now]);

  // ── Planning helpers ───────────────────────────────────────────────────────────────
  const summarize = useCallback((result: PlanResult, taskList: Task[], moved = 0): PlanSummary => ({
    placed: result.create.length,
    moved,
    short: result.unscheduled
      .map((u) => ({ task: taskList.find((t) => t.id === u.taskId) as Task, missingMin: u.missingMin }))
      .filter((u) => u.task),
  }), []);

  /** Runs the scheduler on the latest data (plus optional "not saved yet" changes) and saves the result. */
  const replan = useCallback(
    (mode: PlanMode, over?: { tasks?: Task[]; blocks?: Block[]; dropIds?: string[] }): PlanSummary => {
      const s = stateRef.current;
      const dropped = new Set(over?.dropIds || []);
      const taskList = over?.tasks ?? s.tasks;
      const blockList = (over?.blocks ?? s.blocks).filter((b) => !dropped.has(b.id));
      const result = planSchedule({
        now: Date.now(),
        mode,
        settings: s.settings,
        subjects: s.subjects,
        classes: s.classes,
        tasks: taskList,
        blocks: blockList,
      });
      applyPlan(uid, Array.from(new Set([...result.removeIds, ...dropped])), result.create);
      return summarize(result, taskList);
    },
    [uid, summarize],
  );

  // ── Actions ────────────────────────────────────────────────────────────────────────
  const actions = useMemo(() => {
    const now0 = () => Date.now();

    const plannedUnlockedIds = (taskId: string) =>
      stateRef.current.blocks.filter((b) => b.taskId === taskId && b.status === "planned" && !b.locked).map((b) => b.id);

    /** Planned sessions of OTHER tasks that sit on top of a time you picked yourself. */
    const overlapping = (start: number, end: number, exceptTaskId: string) =>
      stateRef.current.blocks
        .filter(
          (b) =>
            b.taskId !== exceptTaskId &&
            b.status === "planned" &&
            !b.locked &&
            Date.parse(b.start) < end &&
            Date.parse(b.end) > start,
        )
        .map((b) => b.id);

    const deleteTaskIds = (taskIds: string[]) => {
      const set = new Set(taskIds);
      const blockIds = stateRef.current.blocks.filter((b) => set.has(b.taskId)).map((b) => b.id);
      deleteTasksCascade(uid, taskIds, blockIds);
    };

    const completeTask = (id: string) => {
      patchDoc<Task>(uid, "tasks", id, { status: "done", completedAt: new Date().toISOString() });
      // Sessions that were still planned are no longer needed.
      const ids = stateRef.current.blocks.filter((b) => b.taskId === id && b.status === "planned").map((b) => b.id);
      runBatched(ids.map((bid) => (b) => b.delete(docRef(uid, "blocks", bid))));
    };

    return {
      saveSettings: (next: Settings) => {
        setSettings(next);
        setDoc(userRef(uid), { settings: next }, { merge: true }).catch((e) => console.error(e));
      },

      // Subjects
      addSubject: (data: Omit<Subject, "id">) => createDoc<Subject>(uid, "subjects", data),
      updateSubject: (id: string, patch: Partial<Omit<Subject, "id">>) => patchDoc<Subject>(uid, "subjects", id, patch),
      deleteSubject: (id: string) => {
        const s = stateRef.current;
        const ops: ((b: WriteBatch) => void)[] = [(b) => b.delete(docRef(uid, "subjects", id))];
        for (const c of s.classes.filter((c) => c.subjectId === id)) ops.push((b) => b.delete(docRef(uid, "classes", c.id)));
        for (const t of s.tasks.filter((t) => t.subjectId === id)) ops.push((b) => b.update(docRef(uid, "tasks", t.id), { subjectId: null }));
        for (const e of s.exams.filter((e) => e.subjectId === id)) ops.push((b) => b.update(docRef(uid, "exams", e.id), { subjectId: null }));
        runBatched(ops);
      },

      // Classes
      addClass: (data: Omit<ClassSession, "id">) => createDoc<ClassSession>(uid, "classes", data),
      updateClass: (id: string, patch: Partial<Omit<ClassSession, "id">>) => patchDoc<ClassSession>(uid, "classes", id, patch),
      deleteClass: (id: string) => removeDoc(uid, "classes", id),

      // Tasks
      addTask: (input: TaskInput, opts?: { pin?: { start: number; end: number }; autoPlan?: boolean }) => {
        const s = stateRef.current;
        const id = newId(uid, "tasks");
        const task: Task = {
          ...input,
          id,
          loggedMin: 0,
          status: "todo",
          createdAt: new Date().toISOString(),
          completedAt: null,
        };
        const { id: _id, ...data } = task;
        setDocWithId<Task>(uid, "tasks", id, data);

        const extraBlocks: Block[] = [];
        if (opts?.pin && opts.pin.end > opts.pin.start) {
          const block: Omit<Block, "id"> = {
            taskId: id,
            start: new Date(opts.pin.start).toISOString(),
            end: new Date(opts.pin.end).toISOString(),
            status: "planned",
            locked: true,
          };
          extraBlocks.push({ ...block, id: createDoc<Block>(uid, "blocks", block) });
        }
        const plan =
          opts?.autoPlan === false
            ? null
            : replan("incremental", {
                tasks: [...s.tasks, task],
                blocks: [...s.blocks, ...extraBlocks],
                // Other sessions that sit on the time you picked are moved elsewhere.
                dropIds: opts?.pin ? overlapping(opts.pin.start, opts.pin.end, id) : [],
              });
        return { id, plan };
      },

      // `pin` = a time you prefer for this task. Sessions the planner placed are re-planned around it.
      updateTask: (
        id: string,
        patch: Partial<TaskInput> & { loggedMin?: number },
        opts?: { replan?: boolean; pin?: { start: number; end: number } },
      ) => {
        const s = stateRef.current;
        const current = s.tasks.find((t) => t.id === id);
        if (!current) return null;
        patchDoc<Task>(uid, "tasks", id, patch);
        if (!opts?.replan && !opts?.pin) return null;

        const updated: Task = { ...current, ...patch };
        const nextTasks = s.tasks.map((t) => (t.id === id ? updated : t));
        const dropIds = new Set(plannedUnlockedIds(id));
        const extra: Block[] = [];

        if (opts.pin && opts.pin.end > opts.pin.start) {
          const pinMin = Math.round((opts.pin.end - opts.pin.start) / MIN);
          const fixed = s.blocks.filter(
            (b) => b.taskId === id && b.status === "planned" && b.locked && Date.parse(b.end) > Date.now(),
          );
          const fixedMin = fixed.reduce((sum, b) => sum + blockMinutes(b), 0);
          // The new preferred time replaces earlier fixed times when together they would be more than the time left.
          if (fixedMin + pinMin > remainingMinutes(updated, s.blocks)) for (const b of fixed) dropIds.add(b.id);
          for (const other of overlapping(opts.pin.start, opts.pin.end, id)) dropIds.add(other);
          const block: Omit<Block, "id"> = {
            taskId: id,
            start: new Date(opts.pin.start).toISOString(),
            end: new Date(opts.pin.end).toISOString(),
            status: "planned",
            locked: true,
          };
          extra.push({ ...block, id: createDoc<Block>(uid, "blocks", block) });
        }
        return replan("incremental", { tasks: nextTasks, blocks: [...s.blocks, ...extra], dropIds: Array.from(dropIds) });
      },

      completeTask,

      reopenTask: (id: string) => {
        const s = stateRef.current;
        patchDoc<Task>(uid, "tasks", id, { status: "todo", completedAt: null });
        const next = s.tasks.map((t) => (t.id === id ? { ...t, status: "todo" as const, completedAt: null } : t));
        return replan("incremental", { tasks: next });
      },

      deleteTask: (id: string) => deleteTaskIds([id]),

      // Sessions
      toggleBlockDone: (blockId: string) => {
        const s = stateRef.current;
        const block = s.blocks.find((b) => b.id === blockId);
        if (!block) return;
        const task = s.tasks.find((t) => t.id === block.taskId);

        if (block.status === "done") {
          // Undo: take back only the minutes that ticking added. Time you really focused stays counted.
          const back = block.creditedMin || 0;
          patchDoc<Block>(uid, "blocks", blockId, { status: "planned", creditedMin: 0 });
          if (task && back > 0) patchDoc<Task>(uid, "tasks", task.id, { loggedMin: increment(-back) as unknown as number });
          return;
        }

        // Ticking a session counts the part of it you did not already work with the timer.
        const credit = Math.max(0, blockMinutes(block) - (block.focusedMin || 0));
        patchDoc<Block>(uid, "blocks", blockId, { status: "done", creditedMin: credit });
        if (!task) return;
        if (credit > 0) patchDoc<Task>(uid, "tasks", task.id, { loggedMin: increment(credit) as unknown as number });
        if (task.status === "todo") {
          const after = s.blocks.map((b) => (b.id === blockId ? { ...b, status: "done" as const, creditedMin: credit } : b));
          if (remainingMinutes({ ...task, loggedMin: (task.loggedMin || 0) + credit }, after) <= 0) {
            completeTask(task.id);
            toaster.create({ type: "success", title: "Task finished", description: `"${task.title}" is complete. Nice work!` });
          }
        }
      },
      toggleBlockLock: (blockId: string) => {
        const block = stateRef.current.blocks.find((b) => b.id === blockId);
        if (block) patchDoc<Block>(uid, "blocks", blockId, { locked: !block.locked });
      },
      deleteBlock: (blockId: string) => removeDoc(uid, "blocks", blockId),
      addSession: (taskId: string, start: number, end: number) => {
        createDoc<Block>(uid, "blocks", {
          taskId,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          status: "planned",
          locked: true,
        });
      },

      // Exams
      addExam: (data: Omit<Exam, "id">) => createDoc<Exam>(uid, "exams", data),
      updateExam: (id: string, patch: Partial<Omit<Exam, "id">>) => patchDoc<Exam>(uid, "exams", id, patch),
      deleteExam: (id: string) => {
        const study = stateRef.current.tasks.filter((t) => t.examId === id).map((t) => t.id);
        if (study.length) deleteTaskIds(study);
        removeDoc(uid, "exams", id);
      },
      // `examOverride` lets a just-created exam be planned before it has come back from the database.
      generateStudyPlan: (examId: string, examOverride?: Exam) => {
        const s = stateRef.current;
        const exam = examOverride ?? s.exams.find((e) => e.id === examId);
        if (!exam) return { tasks: 0, plan: null };

        // Replace the old (unfinished) study tasks of this exam.
        const old = s.tasks.filter((t) => t.examId === examId && t.status === "todo");
        const oldIds = new Set(old.map((t) => t.id));
        const oldBlocks = s.blocks.filter((b) => oldIds.has(b.taskId));
        deleteTasksCascade(uid, old.map((t) => t.id), oldBlocks.map((b) => b.id));

        const drafts = buildStudyTasks(exam, s.subjects.find((x) => x.id === exam.subjectId), now0());
        const created: Task[] = drafts.map((d) => {
          const id = newId(uid, "tasks");
          setDocWithId<Task>(uid, "tasks", id, d);
          return { ...d, id };
        });

        const keepTasks = s.tasks.filter((t) => !oldIds.has(t.id));
        const plan = replan("incremental", {
          tasks: [...keepTasks, ...created],
          blocks: s.blocks.filter((b) => !oldIds.has(b.taskId)),
        });
        return { tasks: created.length, plan };
      },

      // Focus timer: saves the minutes you worked (called every minute and when the timer stops).
      addProgress: (p: ProgressEntry) => {
        const s = stateRef.current;

        if (p.minutes > 0) {
          // One log per timer round: later saves of the same round add to it.
          setDoc(
            docRef(uid, "focusLogs", p.runId),
            { taskId: p.taskId, blockId: p.blockId, kind: p.kind, at: new Date().toISOString(), minutes: increment(p.minutes) },
            { merge: true },
          ).catch((e) => console.error(e));
        }

        const task = p.taskId ? s.tasks.find((t) => t.id === p.taskId) : undefined;
        if (!task || !p.creditTask) return;

        let blocksAfter = s.blocks;
        if (p.minutes > 0) {
          patchDoc<Task>(uid, "tasks", task.id, { loggedMin: increment(p.minutes) as unknown as number });
          const block = p.blockId ? s.blocks.find((b) => b.id === p.blockId && b.taskId === task.id) : undefined;
          if (block) {
            const focused = (block.focusedMin || 0) + p.minutes;
            // A planned session that has been fully worked is finished by itself.
            const finished = block.status === "planned" && focused >= blockMinutes(block);
            const extra = finished ? { status: "done" as const, creditedMin: 0 } : {};
            patchDoc<Block>(uid, "blocks", block.id, { focusedMin: increment(p.minutes) as unknown as number, ...extra });
            blocksAfter = s.blocks.map((b) => (b.id === block.id ? { ...b, focusedMin: focused, ...extra } : b));
          }
        }

        if (!p.settle) return;

        // The timer stopped: shorten or remove future sessions that are no longer needed.
        const updated: Task = { ...task, loggedMin: (task.loggedMin || 0) + p.minutes };
        if (task.status === "todo" && remainingMinutes(updated, blocksAfter) <= 0) {
          toaster.create({
            type: "success",
            title: "You reached your time estimate",
            description: `"${task.title}" has all the time you planned for it.`,
            duration: 12000,
            action: { label: "Mark done", onClick: () => completeTask(task.id) },
          });
        }
        replan("trim", { tasks: s.tasks.map((t) => (t.id === task.id ? updated : t)), blocks: blocksAfter });
      },

      // Scheduling
      autoSchedule: (mode: PlanMode = "full") => replan(mode),
      rescheduleMissedWork: () => {
        const s = stateRef.current;
        const result = rescheduleMissed({
          now: Date.now(),
          settings: s.settings,
          subjects: s.subjects,
          classes: s.classes,
          tasks: s.tasks,
          blocks: s.blocks,
        });
        applyPlan(uid, result.removeIds, result.create);
        return summarize(result, s.tasks, result.movedCount);
      },
    };
  }, [uid, replan, summarize]);

  const value: PlannerState = {
    loading: loadedCount < 7,
    now,
    uid,
    settings,
    subjects,
    classes,
    tasks,
    blocks,
    exams,
    focusLogs,
    alerts,
    getSubject,
    getTask,
    ...actions,
  };

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner(): PlannerState {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("usePlanner must be used inside <PlannerProvider>");
  return ctx;
}
