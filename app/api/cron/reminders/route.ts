import { NextResponse } from "next/server";
import { adminConfigured } from "@/lib/firebase/admin";
import { runReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Called by GitHub Actions every 5 minutes (and once a day by Vercel Cron).
// Both send:  Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false, error: "Firebase Admin is not configured." }, { status: 500 });
  }
  try {
    const result = await runReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "Reminder run failed." }, { status: 500 });
  }
}
