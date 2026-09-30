"use client";

/** Client dropdown for application status; optimistic UI then a Server Action. */

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import {
  APPLICATION_STATUS_CLASSES,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/lib/constants";
import { updateJobStatus } from "./actions";
import {
  beginExit,
  clearStatus,
  enqueueStatusWrite,
  exitDuration,
  isGeneration,
  jobStatusKey,
  liveStatus,
  nextGeneration,
  pushUndo,
  rememberStatus,
  useStatusVersion,
} from "./job-status";

type StatusSelectProps = {
  atsProvider: string;
  boardSlug: string;
  externalId: string;
  status: string;
  title: string;
  hideDismissed: boolean;
};

function hidesRow(status: ApplicationStatus, hideDismissed: boolean) {
  return hideDismissed && (status === "skipped" || status === "not_qualified");
}

/** Survives rerenders so the select does not snap back before router.refresh(). */
function isStatus(value: string): value is ApplicationStatus {
  return APPLICATION_STATUSES.includes(value as ApplicationStatus);
}

export function StatusSelect({
  atsProvider,
  boardSlug,
  externalId,
  status,
  title,
  hideDismissed,
}: StatusSelectProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const key = jobStatusKey(atsProvider, boardSlug, externalId);
  const serverStatus = isStatus(status) ? status : "new";
  useStatusVersion();
  const current = liveStatus(key, serverStatus);

  useEffect(() => {
    if (liveStatus(key, serverStatus) === serverStatus) clearStatus(key);
  }, [key, serverStatus]);

  return (
    <select
      name="status"
      value={current}
      onChange={(event) => {
        const next = event.target.value;
        if (!isStatus(next) || next === current) return;
        const generation = nextGeneration(key);
        rememberStatus(key, next);
        const willHide = hidesRow(next, hideDismissed);
        if (willHide) {
          beginExit(key);
          pushUndo({ key, title, previous: current, next, atsProvider, boardSlug, externalId });
        }
        startTransition(async () => {
          if (willHide) {
            await new Promise((resolve) => setTimeout(resolve, exitDuration()));
            if (!isGeneration(key, generation)) return;
          }
          try {
            await enqueueStatusWrite(key, () =>
              updateJobStatus({ atsProvider, boardSlug, externalId, status: next }),
            );
          } catch {
            return;
          }
          if (!isGeneration(key, generation)) return;
          router.refresh();
        });
      }}
      className={`rounded-md border px-2 py-1 text-sm font-medium ${APPLICATION_STATUS_CLASSES[current]}`}
    >
      {APPLICATION_STATUSES.map((value) => (
        <option
          key={value}
          value={value}
          className={APPLICATION_STATUS_CLASSES[value]}
        >
          {APPLICATION_STATUS_LABELS[value]}
        </option>
      ))}
    </select>
  );
}
