"use client";

import { Badge, Box, Button, HStack, IconButton, Input, NumberInput, Stack, Switch, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { LuBell, LuClock3, LuMoonStar, LuPencil, LuPlus, LuRefreshCw, LuSave, LuSlidersHorizontal, LuTimer } from "react-icons/lu";
import { FormField, LoadingScreen, PageContainer, PageHeader, SectionCard } from "@/components/Shared";
import { DayPicker } from "@/components/ui/DayPicker";
import { FormDialog } from "@/components/ui/FormDialog";
import { Select } from "@/components/ui/Select";
import { toaster } from "@/components/ui/toaster";
import { routineKinds, weekdayShort } from "@/config/site";
import { defaultRoutine } from "@/config/defaults";
import { useAuth } from "@/context/AuthContext";
import { usePlanner } from "@/context/PlannerContext";
import { disablePush, enablePush, isPushEnabledOnThisDevice, pushSupported } from "@/lib/firebase/messaging";
import { fmtHHMM } from "@/lib/format";
import { toastPlan } from "@/lib/notify";
import { applyPrayerTimings, fetchPrayerTimings } from "@/lib/prayerTimes";
import type { RoutineItem, RoutineKind, Settings, Strategy, Weekday } from "@/lib/types";

function NumField({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 5,
  unit = "min",
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <FormField label={label} hint={hint}>
      <HStack>
        <NumberInput.Root min={min} max={max} step={step} value={String(value)} onValueChange={(e) => onChange(Number(e.value) || 0)} w="28">
          <NumberInput.Input />
        </NumberInput.Root>
        <Text color="fg.muted">{unit}</Text>
      </HStack>
    </FormField>
  );
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function daysLabel(days: Weekday[]): string {
  if (days.length === 7) return "Every day";
  const order: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
  return order.filter((d) => days.includes(d)).map((d) => weekdayShort[d]).join(", ");
}

function SettingsForm() {
  const { user } = useAuth();
  const { settings: saved, saveSettings, autoSchedule, uid } = usePlanner();
  const [s, setS] = useState<Settings>(saved);
  const [editing, setEditing] = useState<RoutineItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushOk, setPushOk] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);

  // Compare ignoring the order of keys (the database may return them in a different order).
  const dirty = useMemo(() => stable(s) !== stable(saved), [s, saved]);

  useEffect(() => {
    setPushOn(isPushEnabledOnThisDevice());
    pushSupported().then(setPushOk);
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = <K extends keyof Settings>(key: K, patch: Partial<Settings[K]> | Settings[K]) =>
    setS((cur) => ({ ...cur, [key]: typeof patch === "object" && !Array.isArray(patch) ? { ...(cur[key] as object), ...patch } : patch }) as Settings);

  const save = () => {
    saveSettings(s);
    toaster.create({ type: "success", title: "Settings saved", description: "Use \"Re-plan my week\" so your study sessions follow the new routine." });
  };

  const replan = () => {
    if (dirty) saveSettings(s);
    // Wait one tick so the planner reads the new settings.
    setTimeout(() => toastPlan(autoSchedule("full"), "Week re-planned"), 50);
  };

  const sortedRoutine = [...s.routine].sort((a, b) => a.start.localeCompare(b.start));

  const saveRoutineItem = () => {
    if (!editing || !editing.label.trim() || editing.end <= editing.start || editing.days.length === 0) return;
    const item = { ...editing, label: editing.label.trim() };
    setS((cur) => ({
      ...cur,
      routine: isNew ? [...cur.routine, item] : cur.routine.map((r) => (r.id === item.id ? item : r)),
    }));
    setEditing(null);
  };

  const syncPrayer = async () => {
    setSyncing(true);
    try {
      const timings = await fetchPrayerTimings(s.prayer.city.trim(), s.prayer.country.trim());
      setS((cur) => ({ ...cur, routine: applyPrayerTimings(cur.routine, timings) }));
      toaster.create({ type: "success", title: "Prayer times loaded", description: "Check them below, then press Save changes." });
    } catch (e) {
      console.error(e);
      toaster.create({ type: "error", title: "Could not load prayer times", description: "Check the city and country spelling and your internet connection." });
    } finally {
      setSyncing(false);
    }
  };

  const togglePush = async (on: boolean) => {
    setPushBusy(true);
    try {
      if (on) {
        const res = await enablePush(uid);
        if (!res.ok) {
          toaster.create({ type: "error", title: "Notifications not enabled", description: res.reason });
          return;
        }
        setPushOn(true);
        // Turn the account-wide switch on right away (using what is already saved).
        const next = { ...saved, notifications: { ...saved.notifications, enabled: true } };
        saveSettings(next);
        setS((cur) => ({ ...cur, notifications: { ...cur.notifications, enabled: true } }));
        toaster.create({ type: "success", title: "Notifications are on for this device" });
      } else {
        await disablePush(uid);
        setPushOn(false);
        toaster.create({ title: "Notifications are off for this device" });
      }
    } finally {
      setPushBusy(false);
    }
  };

  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        subtitle="Tell the planner about your day. Meals, prayer, bath, relax time and sleep are never used for studying."
        actions={
          <>
            <Button variant="outline" onClick={replan}>
              <LuRefreshCw /> Re-plan my week
            </Button>
            <Button colorPalette="teal" onClick={save} disabled={!dirty}>
              <LuSave /> Save changes
            </Button>
          </>
        }
      />

      <Stack gap={6}>
        {/* Day */}
        <SectionCard title="Your day" icon={<LuClock3 />}>
          <HStack align="flex-start" gap={4} flexDirection={{ base: "column", sm: "row" }}>
            <FormField label="I wake up at" hint="Nothing is planned before this.">
              <Input type="time" value={s.wake} onChange={(e) => set("wake", e.target.value)} />
            </FormField>
            <FormField label="I go to bed at" hint="Nothing is planned after this. After midnight is fine (e.g. 00:30).">
              <Input type="time" value={s.bed} onChange={(e) => set("bed", e.target.value)} />
            </FormField>
          </HStack>
          <HStack gap={3} wrap="wrap">
            <Text fontSize="sm" color="fg.muted">
              Time zone for reminders: <strong>{s.timezone}</strong>
            </Text>
            {s.timezone !== deviceZone && (
              <Button size="xs" variant="outline" onClick={() => set("timezone", deviceZone)}>
                Use this device ({deviceZone})
              </Button>
            )}
          </HStack>
        </SectionCard>

        {/* Routine */}
        <SectionCard
          title="Daily routine"
          icon={<LuMoonStar />}
          action={
            <Button
              size="sm"
              colorPalette="teal"
              onClick={() => {
                setIsNew(true);
                setEditing({ id: `r-${Date.now().toString(36)}`, label: "", kind: "meal", start: "12:00", end: "12:30", days: [0, 1, 2, 3, 4, 5, 6] });
              }}
            >
              <LuPlus /> Add
            </Button>
          }
        >
          <Text fontSize="sm" color="fg.muted">
            These are blocked every week: meals, prayer, bath and relax time. Study sessions are planned around them.
          </Text>

          <Stack gap={2}>
            {sortedRoutine.map((r) => {
              const kind = routineKinds.find((k) => k.value === r.kind);
              return (
                <HStack key={r.id} colorPalette={kind?.color} gap={3} px={3} py={2} rounded="lg" borderWidth="1px" borderColor="border" borderLeftWidth="4px" borderLeftColor="colorPalette.solid">
                  <Stack gap={0} flex="1" minW={0}>
                    <HStack gap={2} wrap="wrap">
                      <Text fontWeight="medium">{r.label}</Text>
                      <Badge colorPalette={kind?.color} variant="subtle">
                        {kind?.label}
                      </Badge>
                    </HStack>
                    <Text fontSize="sm" color="fg.muted">
                      {fmtHHMM(r.start)} – {fmtHHMM(r.end)} · {daysLabel(r.days)}
                    </Text>
                  </Stack>
                  <IconButton
                    aria-label={`Edit ${r.label}`}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsNew(false);
                      setEditing({ ...r, days: [...r.days] });
                    }}
                  >
                    <LuPencil />
                  </IconButton>
                </HStack>
              );
            })}
          </Stack>

          <Button
            size="xs"
            variant="ghost"
            w="fit-content"
            onClick={() => {
              if (confirm("Replace your routine with the starting routine? Your changes to it will be lost.")) {
                setS((cur) => ({ ...cur, routine: defaultRoutine.map((r) => ({ ...r, days: [...r.days] })) }));
              }
            }}
          >
            Reset routine to the starting one
          </Button>
        </SectionCard>

        {/* Prayer */}
        <SectionCard title="Prayer times" icon={<LuMoonStar />}>
          <Text fontSize="sm" color="fg.muted">
            Load today's official times (JAKIM) for your area into your routine. Times move a little through the year, so sync again about once a month.
          </Text>
          <HStack align="flex-end" gap={3} wrap="wrap">
            <FormField label="City">
              <Input value={s.prayer.city} onChange={(e) => set("prayer", { city: e.target.value })} />
            </FormField>
            <FormField label="Country">
              <Input value={s.prayer.country} onChange={(e) => set("prayer", { country: e.target.value })} />
            </FormField>
            <Button variant="outline" colorPalette="teal" onClick={syncPrayer} loading={syncing} disabled={!s.prayer.city.trim() || !s.prayer.country.trim()}>
              <LuRefreshCw /> Sync prayer times
            </Button>
          </HStack>
        </SectionCard>

        {/* Planning */}
        <SectionCard title="How the planner schedules" icon={<LuSlidersHorizontal />}>
          <FormField label="Style" hint="Balanced spreads work out over the days before the deadline. Early finishes it as soon as there is free time.">
            <Select
              value={s.scheduling.strategy}
              onChange={(v) => set("scheduling", { strategy: v as Strategy })}
              options={[
                { value: "balanced", label: "Balanced: spread it out" },
                { value: "early", label: "Early: finish it soon" },
              ]}
            />
          </FormField>
          <Box display="grid" gridTemplateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4}>
            <NumField label="Usual session length" value={s.scheduling.sessionMin} min={15} max={240} onChange={(n) => set("scheduling", { sessionMin: n })} />
            <NumField label="Longest session" value={s.scheduling.maxSessionMin} min={15} max={240} onChange={(n) => set("scheduling", { maxSessionMin: n })} />
            <NumField label="Shortest session" value={s.scheduling.minSessionMin} min={10} max={120} onChange={(n) => set("scheduling", { minSessionMin: n })} />
            <NumField label="Break after a session" value={s.scheduling.breakMin} min={0} max={60} onChange={(n) => set("scheduling", { breakMin: n })} />
            <NumField label="Gap around classes" hint="Travel and settling time." value={s.scheduling.classBufferMin} min={0} max={60} onChange={(n) => set("scheduling", { classBufferMin: n })} />
            <NumField label="Most study per day" value={s.scheduling.maxDailyStudyMin} min={30} max={720} step={15} onChange={(n) => set("scheduling", { maxDailyStudyMin: n })} />
          </Box>
          <Switch.Root colorPalette="teal" checked={s.scheduling.allowStretch} onCheckedChange={(e) => set("scheduling", { allowStretch: e.checked })}>
            <Switch.HiddenInput />
            <Switch.Control />
            <Switch.Label>When an exam is too close, use relax time and late nights</Switch.Label>
          </Switch.Root>
          {s.scheduling.allowStretch && (
            <FormField
              label="Latest night study (emergency only)"
              hint="The planner fills normal free time first, then your relax time, and only then hours after bed time, never later than this and never after the exam starts."
            >
              <Input type="time" value={s.scheduling.latestBed} w="40" onChange={(e) => set("scheduling", { latestBed: e.target.value || "03:00" })} />
            </FormField>
          )}
        </SectionCard>

        {/* Pomodoro */}
        <SectionCard title="Focus timer" icon={<LuTimer />}>
          <Box display="grid" gridTemplateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4}>
            <NumField label="Focus" value={s.pomodoro.focusMin} min={5} max={120} onChange={(n) => set("pomodoro", { focusMin: n })} />
            <NumField label="Short break" value={s.pomodoro.shortBreakMin} min={1} max={30} step={1} onChange={(n) => set("pomodoro", { shortBreakMin: n })} />
            <NumField label="Long break" value={s.pomodoro.longBreakMin} min={5} max={60} onChange={(n) => set("pomodoro", { longBreakMin: n })} />
            <NumField label="Rounds before a long break" value={s.pomodoro.cyclesBeforeLong} min={2} max={8} step={1} unit="rounds" onChange={(n) => set("pomodoro", { cyclesBeforeLong: n })} />
          </Box>
          <Switch.Root colorPalette="teal" checked={s.pomodoro.countBreaks} onCheckedChange={(e) => set("pomodoro", { countBreaks: e.checked })}>
            <Switch.HiddenInput />
            <Switch.Control />
            <Switch.Label>Count break time toward the task's progress</Switch.Label>
          </Switch.Root>
          <Switch.Root colorPalette="teal" checked={s.pomodoro.autoStart} onCheckedChange={(e) => set("pomodoro", { autoStart: e.checked })}>
            <Switch.HiddenInput />
            <Switch.Control />
            <Switch.Label>Start the next round or break automatically</Switch.Label>
          </Switch.Root>
        </SectionCard>

        {/* Notifications */}
        <SectionCard title="Push notifications" icon={<LuBell />}>
          <Switch.Root colorPalette="teal" checked={pushOn} disabled={pushBusy || !pushOk} onCheckedChange={(e) => togglePush(e.checked)}>
            <Switch.HiddenInput />
            <Switch.Control />
            <Switch.Label>Notifications on this device</Switch.Label>
          </Switch.Root>
          {!pushOk && (
            <Text fontSize="sm" color="orange.500">
              This browser cannot receive push notifications. On iPhone, open the site in Safari, choose Share, Add to Home Screen, then open it from the Home Screen icon.
            </Text>
          )}
          <Text fontSize="sm" color="fg.muted">
            Turn this on once for each phone or laptop you want reminders on ({user?.email}).
          </Text>

          <Box display="grid" gridTemplateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={4}>
            <NumField label="Before a class" value={s.notifications.classLeadMin} min={5} max={120} onChange={(n) => set("notifications", { classLeadMin: n })} />
            <NumField label="Before a study session" value={s.notifications.sessionLeadMin} min={5} max={120} onChange={(n) => set("notifications", { sessionLeadMin: n })} />
          </Box>

          <Switch.Root colorPalette="teal" checked={s.notifications.dueAlerts} onCheckedChange={(e) => set("notifications", { dueAlerts: e.checked })}>
            <Switch.HiddenInput />
            <Switch.Control />
            <Switch.Label>Deadline and exam alerts</Switch.Label>
          </Switch.Root>

          <Switch.Root colorPalette="teal" checked={s.notifications.digest} onCheckedChange={(e) => set("notifications", { digest: e.checked })}>
            <Switch.HiddenInput />
            <Switch.Control />
            <Switch.Label>Morning summary</Switch.Label>
          </Switch.Root>
          {s.notifications.digest && (
            <NumField label="Send it at (hour, 0-23)" value={s.notifications.digestHour} min={0} max={23} step={1} unit="o'clock" onChange={(n) => set("notifications", { digestHour: Math.min(23, n) })} />
          )}
          <Text fontSize="xs" color="fg.muted">
            Reminders are checked every 5 minutes, so they can arrive a few minutes late. See the README for the one-time setup.
          </Text>
        </SectionCard>
      </Stack>

      {dirty && (
        <Box position="sticky" bottom={4} mt={6} display="flex" justifyContent="center">
          <HStack gap={3} px={4} py={3} rounded="full" bg="bg.panel" borderWidth="1px" borderColor="teal.500" shadow="lg">
            <Text fontSize="sm">You have unsaved changes</Text>
            <Button size="sm" variant="ghost" onClick={() => setS(saved)}>
              Discard
            </Button>
            <Button size="sm" colorPalette="teal" onClick={save}>
              Save
            </Button>
          </HStack>
        </Box>
      )}

      <FormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? "New routine item" : "Edit routine item"}
        onSubmit={saveRoutineItem}
        submitDisabled={!editing || !editing.label.trim() || editing.end <= editing.start || editing.days.length === 0}
        footerLeft={
          editing && !isNew ? (
            <Button
              type="button"
              variant="ghost"
              colorPalette="red"
              onClick={() => {
                setS((cur) => ({ ...cur, routine: cur.routine.filter((r) => r.id !== editing.id) }));
                setEditing(null);
              }}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {editing && (
          <Stack gap={4}>
            <FormField label="Name">
              <Input autoFocus value={editing.label} placeholder="e.g. Dinner" onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            </FormField>
            <FormField label="Type">
              <Select value={editing.kind} onChange={(v) => setEditing({ ...editing, kind: v as RoutineKind })} options={routineKinds} />
            </FormField>
            <HStack align="flex-start">
              <FormField label="From">
                <Input type="time" value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} />
              </FormField>
              <FormField label="To">
                <Input type="time" value={editing.end} onChange={(e) => setEditing({ ...editing, end: e.target.value })} />
              </FormField>
            </HStack>
            <FormField label="On which days?">
              <DayPicker value={editing.days} onChange={(days) => setEditing({ ...editing, days })} />
            </FormField>
            {editing.end <= editing.start && (
              <Text fontSize="sm" color="red.500">
                The end time must be after the start time on the same day.
              </Text>
            )}
          </Stack>
        )}
      </FormDialog>
    </PageContainer>
  );
}

export default function SettingsPage() {
  const { loading } = usePlanner();
  if (loading) return <LoadingScreen />;
  return <SettingsForm />;
}
