// Push notifications (Firebase Cloud Messaging) – browser side.
// The server side that actually sends reminders is lib/reminders.ts.

import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { firebaseConfig, getDb, getFirebaseApp, vapidKey } from "./client";

const TOKEN_KEY = "studyflow:pushToken";

export async function pushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type PushResult = { ok: true } | { ok: false; reason: string };

/** Asks permission, registers this device and saves its token so the server can reach it. */
export async function enablePush(uid: string): Promise<PushResult> {
  if (!(await pushSupported())) {
    return {
      ok: false,
      reason:
        "This browser does not support push notifications. On iPhone, add the site to your Home Screen first (Share → Add to Home Screen).",
    };
  }
  if (!vapidKey) {
    return { ok: false, reason: "NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing. See the README (Push notifications)." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Notifications are blocked. Allow them in your browser's site settings and try again." };
  }

  try {
    const params = new URLSearchParams(firebaseConfig as Record<string, string>);
    const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`);
    await navigator.serviceWorker.ready;

    const messaging = getMessaging(getFirebaseApp());
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, reason: "Could not get a notification token for this device." };

    const db = getDb();
    await setDoc(doc(db, "users", uid, "devices", await sha256(token)), {
      token,
      userAgent: navigator.userAgent,
      createdAt: new Date().toISOString(),
    });
    await setDoc(doc(db, "users", uid), { notifyEnabled: true }, { merge: true });
    localStorage.setItem(TOKEN_KEY, token);
    return { ok: true };
  } catch (err) {
    console.error(err);
    return { ok: false, reason: "Something went wrong while turning on notifications. Please try again." };
  }
}

/** Stops notifications on this device. */
export async function disablePush(uid: string): Promise<void> {
  const db = getDb();
  const token = localStorage.getItem(TOKEN_KEY);
  try {
    if (token) await deleteDoc(doc(db, "users", uid, "devices", await sha256(token)));
    await deleteToken(getMessaging(getFirebaseApp()));
  } catch (err) {
    console.error(err);
  }
  localStorage.removeItem(TOKEN_KEY);
  const left = await getDocs(collection(db, "users", uid, "devices"));
  if (left.empty) await setDoc(doc(db, "users", uid), { notifyEnabled: false }, { merge: true });
}

export function isPushEnabledOnThisDevice(): boolean {
  if (typeof window === "undefined") return false;
  return Notification.permission === "granted" && Boolean(localStorage.getItem(TOKEN_KEY));
}

/** Calls `callback` when a notification arrives while the planner is open. */
export async function listenForeground(callback: (title: string, body: string) => void): Promise<() => void> {
  if (!(await pushSupported())) return () => {};
  return onMessage(getMessaging(getFirebaseApp()), (payload) => {
    callback(payload.notification?.title || "Reminder", payload.notification?.body || "");
  });
}
