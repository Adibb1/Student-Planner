// Browser-side Firebase setup (Auth + Firestore). Your keys come from .env.local.
// NOTE: variables must be written out in full (process.env.NEXT_PUBLIC_...) so Next.js can
// put them into the browser bundle.

import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";
import {
  type Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

export const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

let db: Firestore | null = null;

/** Firestore with an offline cache, so the planner still opens without internet. */
export function getDb(): Firestore {
  if (db) return db;
  const app = getFirebaseApp();
  try {
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    try {
      db = getFirestore(app); // already created (e.g. after a hot reload)
    } catch {
      db = initializeFirestore(app, { ignoreUndefinedProperties: true });
    }
  }
  return db;
}
