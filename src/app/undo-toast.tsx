"use client";

/** Bottom notice after a row is hidden, with a short window to restore the previous status. */
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { APPLICATION_STATUS_LABELS } from "@/lib/constants";
import { updateJobStatus } from "./actions";
import {
  cancelExit,
  dismissUndo,
  enqueueStatusWrite,
  isGeneration,
  nextGeneration,
  rememberStatus,
  undoItems,
  useStatusVersion,
  type UndoItem,
} from "./job-status";

export function UndoToast() {
  useStatusVersion();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const items = undoItems();
  if (!items.length) return null;

  function undo(item: UndoItem) {
    const generation = nextGeneration(item.key);
    cancelExit(item.key);
    rememberStatus(item.key, item.previous);
    dismissUndo(item.id);
    startTransition(async () => {
      try {
        await enqueueStatusWrite(item.key, () =>
          updateJobStatus({
            atsProvider: item.atsProvider,
            boardSlug: item.boardSlug,
            externalId: item.externalId,
            status: item.previous,
          }),
        );
      } catch {
        return;
      }
      if (!isGeneration(item.key, generation)) return;
      router.refresh();
    });
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="toast-in pointer-events-auto flex max-w-lg items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          role="status"
        >
          <p className="min-w-0 truncate">
            Marked “{item.title}” as {APPLICATION_STATUS_LABELS[item.next].toLowerCase()}
          </p>
          <button
            type="button"
            onClick={() => undo(item)}
            className="shrink-0 rounded-md px-2 py-1 font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
          >
            Undo
          </button>
        </div>
      ))}
    </div>
  );
}
