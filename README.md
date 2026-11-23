<div align="center">

# StudyFlow | Student Planner

A personal study planner built with **Next.js**, **Chakra UI** and **Firebase**, in the same style as my portfolio.

Weekly timetable, assignments with time estimates, automatic study scheduling around prayer, meals, bath, relax time and sleep, one-click rescheduling, exam countdowns, a Pomodoro timer and push reminders.

</div>

---

## Features

| Feature | What it does |
| --- | --- |
| **Google sign-in** | Sign in with Google on any phone or laptop. Each person (you and your friends) only sees their own data. |
| **Weekly timetable** | Add each class once. It repeats every week. Week view on laptops, one-day tabs on phones. |
| **Daily routine** | Wake time, bed time, meals, prayer, bath and relax time. These are never used for studying. |
| **Tasks with time estimates** | Every task has a deadline and a "how long will it take" estimate. |
| **Auto-scheduling** | Splits the work into sessions and places them in your real free time before the deadline. |
| **Reserved subject time** | Keep a weekly slot for a subject, e.g. Math homework every Wednesday 8-9. The planner uses it first. |
| **Pinned sessions** | Choose an exact time for a session yourself. The planner never moves it. |
| **Reschedule missed work** | One tap moves every missed session into your next free time. |
| **Exam countdown and study plan** | Add an exam with topics and total study hours. It becomes study tasks that get scheduled. |
| **Pomodoro focus timer** | Focus rounds and breaks. Minutes are counted toward the task. |
| **Prayer times** | Optional sync of today's JAKIM times into your routine. |
| **Push notifications** | Before class, before a study session, before a deadline or exam, and a morning summary. |
| **Works offline and installs like an app** | Firestore keeps an offline copy. Add to Home Screen on your phone. |
| **Dark and light mode** | Dark by default, same as the portfolio. |

---

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | Next.js (App Router) |
| Language | TypeScript |
| UI library | Chakra UI v3 |
| Theming | next-themes |
| Icons | React Icons (Lucide set) |
| Login and database | Firebase Authentication and Cloud Firestore |
| Push notifications | Firebase Cloud Messaging |
| Hosting | Vercel |

---

## File structure

It follows the portfolio's layout (`app/`, `components/`, `lib/`, `config/`), so you know where to look.

```
student-planner/
├── app/
│   ├── layout.tsx                 Root layout (theme and sign-in provider)
│   ├── page.tsx                   Landing page with "Continue with Google"
│   ├── manifest.ts                "Add to Home Screen" settings
│   ├── (app)/                     Pages that need sign-in
│   │   ├── layout.tsx             Sign-in check, navbar, data loading
│   │   ├── dashboard/page.tsx     Today
│   │   ├── timetable/page.tsx     Weekly timetable and classes
│   │   ├── tasks/page.tsx         Assignments and sessions
│   │   ├── exams/page.tsx         Exams and study plans
│   │   ├── focus/page.tsx         Pomodoro timer
│   │   ├── subjects/page.tsx      Subjects and reserved study time
│   │   └── settings/page.tsx      Routine, prayer, planning, timer, notifications
│   └── api/cron/reminders/route.ts   Sends push reminders (called every 5 min)
├── components/
│   ├── Navbar.tsx  Shared.tsx  AgendaRow.tsx ...
│   ├── dashboard/                 Cards on the Today page
│   ├── tasks/                     Task card and task form
│   └── ui/                        Provider, toaster, dialog, select, day picker
├── config/
│   ├── site.ts                    App name, menu, labels   (edit text here)
│   └── defaults.ts                Starting routine and preferences
├── context/
│   ├── AuthContext.tsx            Who is signed in
│   └── PlannerContext.tsx         Live data and all actions
├── lib/
│   ├── scheduler/                 The planning engine (no Firebase, easy to test)
│   │   ├── freeTime.ts            Finds free time in a day
│   │   ├── autoSchedule.ts        Places study sessions
│   │   ├── reschedule.ts          Missed-session recovery
│   │   └── studyPlan.ts           Exam → study tasks
│   ├── firebase/                  Firebase client, admin and messaging setup
│   ├── reminders.ts               Which push reminders are due
│   ├── prayerTimes.ts             Prayer time sync
│   ├── types.ts  format.ts  agenda.ts  db.ts ...
├── public/
│   └── firebase-messaging-sw.js   Receives push notifications
├── firebase/firestore.rules       Security rules (everyone sees only their own data)
├── .github/workflows/reminders.yml   Triggers reminders every 5 minutes
├── scripts/test-scheduler.ts      Self-check for the planner logic
└── .env.example                   List of keys you need
```

---

## Setup

You need [Node.js](https://nodejs.org/) 20 or newer and a Google account.

### 1. Install and run

```bash
npm install
cp .env.example .env.local      # on Windows: copy .env.example .env.local
npm run dev
```

Open http://localhost:3000. Until you add your Firebase keys, the app shows a setup notice.

### 2. Create the Firebase project (free Spark plan is enough)

1. Go to the [Firebase console](https://console.firebase.google.com/) → **Add project**.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable** and save.
3. **Build → Firestore Database → Create database** (production mode, choose a nearby region such as `asia-southeast1`).
4. Open **Firestore → Rules**, paste the contents of `firebase/firestore.rules`, and **Publish**.
   This is what keeps your friends' data private. Do not skip it.
5. **Project settings (gear icon) → General → Your apps → Web (`</>`)**, register an app, and copy the config values into `.env.local`:
   `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._STORAGE_BUCKET`, `..._MESSAGING_SENDER_ID`, `..._APP_ID`.
6. Restart `npm run dev`, then sign in.

### 3. Deploy on Vercel

1. Push the project to a GitHub repository.
2. On [Vercel](https://vercel.com/) → **Add New → Project** → import the repository.
3. Add every variable from `.env.local` under **Settings → Environment Variables**. Set `NEXT_PUBLIC_APP_URL` to your Vercel address.
4. Deploy.
5. **Important:** in Firebase → **Authentication → Settings → Authorized domains**, add your Vercel domain (for example `your-planner.vercel.app`) and your own domain if you use one. Without this, Google sign-in fails with "unauthorized domain".

### 4. Push notifications (optional, about 10 minutes)

1. Firebase → **Project settings → Cloud Messaging → Web Push certificates → Generate key pair**. Put it in `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
2. Firebase → **Project settings → Service accounts → Generate new private key**. From the downloaded JSON, copy `project_id`, `client_email` and `private_key` into `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL` and `FIREBASE_ADMIN_PRIVATE_KEY` (Vercel environment variables only. Never commit this file).
3. Make up a long random `CRON_SECRET` (the command is in `.env.example`) and add it to Vercel.
4. In your GitHub repository → **Settings → Secrets and variables → Actions**, add two secrets:
   `APP_URL` (your Vercel address, no trailing slash) and `CRON_SECRET` (same value as in Vercel).
   The workflow in `.github/workflows/reminders.yml` then calls your site every 5 minutes.
5. Redeploy, open the planner → **Settings → Push notifications** → turn on for each device.

Notes:
- Vercel's free plan allows only one scheduled run a day, which is why GitHub Actions does the 5-minute checks. GitHub can delay scheduled runs by a few minutes, so reminders may arrive a little late.
- On iPhone, push works only after you add the site to the Home Screen (Safari → Share → Add to Home Screen) and open it from that icon.

### 5. Add your friends

Send them the link. They sign in with their own Google account and get their own empty planner with the same default routine. Nobody can see anyone else's data.

---

## How the planner thinks

1. **Free time** for a day = wake-up to bed time, minus classes (with a gap around them), minus your routine (meals, prayer, bath, relax), minus sessions already fixed in place.
2. **Tasks** are handled earliest deadline first. Overdue work goes first.
3. Each task's remaining time is split into sessions (usual length, longest and shortest are in Settings) and placed:
   - **Balanced** spreads sessions over the days before the deadline.
   - **Early** uses the earliest free time.
   - Reserved subject time (for example Math on Wednesday 8-9) is used first for that subject.
4. If something cannot fit before its deadline, you get a message saying how many minutes are short. Nothing is hidden.
5. **Reschedule missed** first tries to put only the missed work into free time and leave everything else alone. If that cannot fit, it re-plans the whole week and uses that if it fits more.
6. Sessions you **pin** (lock) are never moved.

The logic is in `lib/scheduler/` and does not depend on Firebase. Check it any time with:

```bash
npm run test:scheduler
```

---

## Editing the app

| I want to... | Edit |
| --- | --- |
| Rename the app, change menu items or the landing page features | `config/site.ts` |
| Change the starting routine or default preferences for new accounts | `config/defaults.ts` |
| Change the teal accent | Search for `teal` (Chakra colour palette) or add a custom palette in `components/ui/provider.tsx` |
| Change how sessions are placed | `lib/scheduler/autoSchedule.ts` |
| Change which push reminders are sent | `lib/reminders.ts` |
| Add a new page | New folder in `app/(app)/`, then add a link in `config/site.ts` |

Your own routine (prayer, meals, relax and so on) is edited in the app: **Settings → Daily routine**.

---

## Data model (Firestore)

Everything lives under `users/{uid}/`:

`subjects`, `classes`, `tasks`, `blocks` (planned study sessions), `exams`, `focusLogs`, `devices` (push tokens) and `notifLog` (which reminders were already sent). Preferences are stored in the user document under `settings`.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "This website address is not allowed yet" when signing in | Add the domain in Firebase → Authentication → Settings → Authorized domains |
| "Missing or insufficient permissions" | Publish `firebase/firestore.rules` in the Firestore console |
| Sign-in pop-up closes straight away on a phone | Allow pop-ups, or try again. The app falls back to a redirect on some browsers |
| No notifications | Check `NEXT_PUBLIC_FIREBASE_VAPID_KEY`, the GitHub secrets, and that **Settings → Notifications on this device** is on. Run the workflow manually from the GitHub Actions tab to test |
| Prayer sync fails | Check the city and country spelling in Settings (for example `Bangi`, `Malaysia`) |
| Sessions overlap something after changing my timetable | Press **Re-plan my week** on the Today page or in Settings |

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the development server |
| `npm run build` | Creates an optimized production build |
| `npm run start` | Serves the production build locally |
| `npm run test:scheduler` | Runs the planner self-check |
