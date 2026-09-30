"use client";

/** Optimistic status overrides so a row can collapse or hide before the server refresh. */
import { useSyncExternalStore } from "react";
import type { ApplicationStatus } from "@/lib/constants";

let version = 0;
const overrides = new Map<string, ApplicationStatus>();
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export function jobStatusKey(atsProvider: string, boardSlug: string, externalId: string) {
  return `${atsProvider}:${boardSlug}:${externalId}`;
}

export function rememberStatus(key: string, status: ApplicationStatus) {
  overrides.set(key, status);
  emit();
}

type ExitState = "leaving" | "gone";

const exits = new Map<string, { state: ExitState; timer: number }>();

export function exitDuration() {
  if (typeof window === "undefined") return 420;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420;
}

/** Start the row's exit animation. A finished exit can be started again. */
export function beginExit(key: string) {
  const current = exits.get(key);
  if (current?.state === "leaving") return;
  if (current?.timer) window.clearTimeout(current.timer);
  const delay = exitDuration();
  const timer = window.setTimeout(() => {
    exits.set(key, { state: "gone", timer: 0 });
    emit();
  }, delay);
  exits.set(key, { state: "leaving", timer });
  emit();
}

export function cancelExit(key: string) {
  const current = exits.get(key);
  if (!current) return;
  if (current.timer) window.clearTimeout(current.timer);
  exits.delete(key);
  emit();
}

export function exitState(key: string): "idle" | ExitState {
  return exits.get(key)?.state ?? "idle";
}

const generations = new Map<string, number>();
const writes = new Map<string, Promise<void>>();

export function nextGeneration(key: string) {
  const generation = (generations.get(key) ?? 0) + 1;
  generations.set(key, generation);
  return generation;
}

export function isGeneration(key: string, generation: number) {
  return generations.get(key) === generation;
}

/** Run status writes for one job in order, so an undo cannot be overwritten by an older save. */
export function enqueueStatusWrite(key: string, task: () => Promise<void>) {
  const previous = writes.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  writes.set(key, run);
  return run;
}

export type UndoItem = {
  id: number;
  key: string;
  title: string;
  previous: ApplicationStatus;
  next: ApplicationStatus;
  atsProvider: string;
  boardSlug: string;
  externalId: string;
  timer: number;
};

const undos: UndoItem[] = [];
let undoSeq = 0;

export function pushUndo(item: Omit<UndoItem, "id" | "timer">) {
  const id = ++undoSeq;
  const timer = window.setTimeout(() => dismissUndo(id), 6000);
  undos.push({ ...item, id, timer });
  emit();
  return id;
}

export function dismissUndo(id: number) {
  const index = undos.findIndex((item) => item.id === id);
  if (index < 0) return;
  window.clearTimeout(undos[index].timer);
  undos.splice(index, 1);
  emit();
}

export function undoItems() {
  return undos;
}

export function clearStatus(key: string) {
  if (!overrides.delete(key)) return;
  emit();
}

export function liveStatus(key: string, serverStatus: ApplicationStatus) {
  return overrides.get(key) ?? serverStatus;
}

export function hasOverride(key: string) {
  return overrides.has(key);
}

export function useStatusVersion() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
    () => 0,
  );
}
