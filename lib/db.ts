// Small helpers for reading/writing your data in Firestore.
// Everything lives under  users/{your uid}/{subjects|classes|tasks|blocks|exams|focusLogs}

import { type WriteBatch, collection, deleteDoc, doc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import type { NewBlock } from "@/lib/scheduler";
import { getDb } from "./firebase/client";

export type CollectionName = "subjects" | "classes" | "tasks" | "blocks" | "exams" | "focusLogs";

type ErrorHandler = (error: unknown) => void;
let onWriteError: ErrorHandler = (e) => console.error(e);

/** The app sets this so failed saves show a message to the person. */
export function setWriteErrorHandler(fn: ErrorHandler) {
  onWriteError = fn;
}

export const colRef = (uid: string, name: CollectionName) => collection(getDb(), "users", uid, name);
export const docRef = (uid: string, name: CollectionName, id: string) => doc(getDb(), "users", uid, name, id);
export const userRef = (uid: string) => doc(getDb(), "users", uid);

/** Saves happen instantly on screen (and offline); errors are reported if the server refuses them. */
export function fire(promise: Promise<unknown>) {
  promise.catch((e) => onWriteError(e));
}

export function newId(uid: string, name: CollectionName): string {
  return doc(colRef(uid, name)).id;
}

export function createDoc<T extends { id: string }>(uid: string, name: CollectionName, data: Omit<T, "id">): string {
  const ref = doc(colRef(uid, name));
  fire(setDoc(ref, data as Record<string, unknown>));
  return ref.id;
}

export function setDocWithId<T extends { id: string }>(uid: string, name: CollectionName, id: string, data: Omit<T, "id">) {
  fire(setDoc(docRef(uid, name, id), data as Record<string, unknown>));
}

export function patchDoc<T extends { id: string }>(uid: string, name: CollectionName, id: string, patch: Partial<Omit<T, "id">>) {
  fire(updateDoc(docRef(uid, name, id), patch as Record<string, unknown>));
}

export function removeDoc(uid: string, name: CollectionName, id: string) {
  fire(deleteDoc(docRef(uid, name, id)));
}

/** Runs many writes in groups (Firestore allows at most 500 writes per batch). */
export function runBatched(ops: ((batch: WriteBatch) => void)[]) {
  const db = getDb();
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) op(batch);
    fire(batch.commit());
  }
}

/** Saves the result of the scheduler: removes old sessions and adds the new ones. */
export function applyPlan(uid: string, removeIds: string[], create: NewBlock[]) {
  const ops: ((batch: WriteBatch) => void)[] = [];
  for (const id of removeIds) ops.push((b) => b.delete(docRef(uid, "blocks", id)));
  for (const block of create) {
    const ref = doc(colRef(uid, "blocks"));
    ops.push((b) => b.set(ref, block));
  }
  runBatched(ops);
}

/** Deletes tasks together with all their sessions. */
export function deleteTasksCascade(uid: string, taskIds: string[], blockIds: string[]) {
  const ops: ((batch: WriteBatch) => void)[] = [];
  for (const id of taskIds) ops.push((b) => b.delete(docRef(uid, "tasks", id)));
  for (const id of blockIds) ops.push((b) => b.delete(docRef(uid, "blocks", id)));
  runBatched(ops);
}
