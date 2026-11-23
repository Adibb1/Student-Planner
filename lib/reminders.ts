// Decides which push reminders are due right now and sends them.
// Called every few minutes by /api/cron/reminders (see README → Push notifications).
//
// Reminders sent:
//   • a class starting soon
//   • a planned study session starting soon
//   • something due in 24 h / 3 h, or just became overdue
//   • an exam in 3 days / tomorrow
//   • a morning summary (also tells you if you have missed sessions)
// Every reminder is written to users/{uid}/notifLog/{key} first, so it is never sent twice.

import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { defaultSettings } from "@/config/defaults";
import { mergeSettings } from "@/lib/settings";
import type { Weekday } from "@/lib/types";
import { adminDb, adminMessaging } from "./firebase/admin";

type Reminder = { key: string; title: string; body: string; link: string };

const MIN = 60_000;
const HOUR = 3_600_000;

function localParts(ms: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      get("weekday"),
    ) as Weekday,
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

const hhmm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const timeLabel = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

async function collect(
  db: Firestore,
  uid: string,
  now: number,
): Promise<{ reminders: Reminder[]; tokens: { id: string; token: string }[] }> {
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.data() as DocumentData | undefined;
  const settings = mergeSettings(user?.settings, defaultSettings().timezone);
  const n = settings.notifications;
  if (!n.enabled) return { reminders: [], tokens: [] };

  const devices = await userRef.collection("devices").get();
  const tokens = devices.docs
    .map((d) => ({ id: d.id, token: String(d.get("token") || "") }))
    .filter((d) => d.token);
  if (tokens.length === 0) return { reminders: [], tokens: [] };

  const tz = settings.timezone || "Asia/Kuala_Lumpur";
  const local = localParts(now, tz);
  const [subjectsSnap, classesSnap, tasksSnap, examsSnap] = await Promise.all([
    userRef.collection("subjects").get(),
    userRef.collection("classes").get(),
    userRef.collection("tasks").where("status", "==", "todo").get(),
    userRef.collection("exams").get(),
  ]);
  const subjectName = new Map(
    subjectsSnap.docs.map((d) => [d.id, String(d.get("name") || "Class")]),
  );
  const tasks = tasksSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as DocumentData & { id: string },
  );
  const taskTitle = new Map(tasks.map((t) => [t.id, String(t.title)]));
  const reminders: Reminder[] = [];

  // Classes starting soon
  for (const d of classesSnap.docs) {
    const c = d.data();
    if (c.day !== local.weekday) continue;
    const diff = hhmm(String(c.start)) - local.minutes;
    if (diff > 0 && diff <= n.classLeadMin) {
      reminders.push({
        key: `class:${d.id}:${local.date}`,
        title: `${subjectName.get(c.subjectId) || "Class"} starts in ${diff} min`,
        body: `${c.start}${c.room ? ` · ${c.room}` : ""}`,
        link: "/timetable",
      });
    }
  }

  // Planned study sessions starting soon
  const nowIso = new Date(now).toISOString();
  const soonIso = new Date(now + n.sessionLeadMin * MIN).toISOString();
  const soonBlocks = await userRef
    .collection("blocks")
    .where("start", ">", nowIso)
    .where("start", "<=", soonIso)
    .get();
  for (const d of soonBlocks.docs) {
    const b = d.data();
    if (b.status !== "planned" || !taskTitle.has(b.taskId)) continue;
    reminders.push({
      key: `block:${d.id}`,
      title: `Study time: ${taskTitle.get(b.taskId)}`,
      body: `Starts at ${timeLabel(b.start, tz)} – a good moment to begin.`,
      link: `/focus?task=${b.taskId}&block=${d.id}`,
    });
  }

  // Due dates
  if (n.dueAlerts) {
    for (const t of tasks) {
      const due = Date.parse(String(t.dueAt));
      if (!Number.isFinite(due)) continue;
      const left = due - now;
      if (left > 0 && left <= 3 * HOUR) {
        reminders.push({
          key: `due3:${t.id}`,
          title: `Due in under 3 hours`,
          body: String(t.title),
          link: "/tasks",
        });
      } else if (left > 3 * HOUR && left <= 24 * HOUR) {
        reminders.push({
          key: `due24:${t.id}`,
          title: `Due within 24 hours`,
          body: String(t.title),
          link: "/tasks",
        });
      } else if (left <= 0 && left > -12 * HOUR) {
        reminders.push({
          key: `overdue:${t.id}`,
          title: `Overdue: ${t.title}`,
          body: "Open the planner to reschedule it.",
          link: "/tasks",
        });
      }
    }
    for (const d of examsSnap.docs) {
      const starts = Date.parse(String(d.get("startsAt")));
      const left = starts - now;
      if (left > 0 && left <= 24 * HOUR) {
        reminders.push({
          key: `exam1:${d.id}`,
          title: `Exam tomorrow: ${d.get("title")}`,
          body: `Starts at ${timeLabel(d.get("startsAt"), tz)}. Good luck!`,
          link: "/exams",
        });
      } else if (left > 24 * HOUR && left <= 72 * HOUR) {
        reminders.push({
          key: `exam3:${d.id}`,
          title: `Exam in 3 days: ${d.get("title")}`,
          body: "Check your study plan.",
          link: "/exams",
        });
      }
    }
  }

  // Morning summary
  if (n.digest && local.hour === n.digestHour) {
    const dayBlocks = await userRef
      .collection("blocks")
      .where("start", ">=", new Date(now - 14 * HOUR).toISOString())
      .where("start", "<=", new Date(now + 20 * HOUR).toISOString())
      .get();
    const sessionsToday = dayBlocks.docs.filter(
      (d) =>
        d.get("status") === "planned" &&
        localParts(Date.parse(d.get("start")), tz).date === local.date,
    ).length;
    const classesToday = classesSnap.docs.filter(
      (d) => d.get("day") === local.weekday,
    ).length;
    const dueToday = tasks.filter(
      (t) => localParts(Date.parse(String(t.dueAt)), tz).date === local.date,
    ).length;
    const missedSnap = await userRef
      .collection("blocks")
      .where("end", "<", nowIso)
      .where("end", ">", new Date(now - 7 * 24 * HOUR).toISOString())
      .get();
    const missed = missedSnap.docs.filter(
      (d) => d.get("status") === "planned" && taskTitle.has(d.get("taskId")),
    ).length;

    const parts = [
      `${classesToday} class${classesToday === 1 ? "" : "es"}`,
      `${sessionsToday} study session${sessionsToday === 1 ? "" : "s"}`,
      `${dueToday} due today`,
    ];
    reminders.push({
      key: `digest:${local.date}`,
      title: "Good morning! Here is your day",
      body: `${parts.join(" · ")}${missed ? `. ${missed} missed session${missed === 1 ? "" : "s"} – tap to reschedule.` : "."}`,
      link: "/dashboard",
    });
  }

  return { reminders, tokens };
}

export async function runReminders(
  now = Date.now(),
): Promise<{ users: number; sent: number }> {
  const db = adminDb();
  const users = await db
    .collection("users")
    .where("notifyEnabled", "==", true)
    .get();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  let sent = 0;

  for (const u of users.docs) {
    try {
      const { reminders, tokens } = await collect(db, u.id, now);
      for (const r of reminders) {
        // create() fails if the key already exists → this reminder was already sent.
        try {
          await u.ref
            .collection("notifLog")
            .doc(r.key)
            .create({ at: new Date(now).toISOString() });
        } catch (err) {
          if ((err as { code?: number }).code === 6) continue;
          throw err;
        }

        const res = await adminMessaging().sendEachForMulticast({
          tokens: tokens.map((t) => t.token),
          notification: { title: r.title, body: r.body },
          data: { url: r.link },
          webpush: appUrl
            ? { fcmOptions: { link: `${appUrl}${r.link}` } }
            : undefined,
        });
        sent += res.successCount;

        // Remove devices that no longer exist (uninstalled, permission removed...).
        await Promise.all(
          res.responses.map(async (resp, i) => {
            const code = resp.error?.code;
            if (
              code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-registration-token"
            ) {
              await u.ref.collection("devices").doc(tokens[i].id).delete();
            }
          }),
        );
      }
    } catch (err) {
      console.error(`Reminders failed for user ${u.id}`, err);
    }
  }
  return { users: users.size, sent };
}
