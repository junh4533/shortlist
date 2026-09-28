"use client";

/** Client dropdown for application status; optimistic UI then a Server Action. */

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  APPLICATION_STATUS_CLASSES,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/lib/constants";
import { updateJobStatus } from "./actions";

type StatusSelectProps = {
  atsProvider: string;
  boardSlug: string;
  externalId: string;
  status: string;
};

/** Survives rerenders so the select does not snap back before router.refresh(). */
const localStatus = new Map<string, ApplicationStatus>();

function isStatus(value: string): value is ApplicationStatus {
  return APPLICATION_STATUSES.includes(value as ApplicationStatus);
}

function jobKey(atsProvider: string, boardSlug: string, externalId: string) {
  return `${atsProvider}:${boardSlug}:${externalId}`;
}

export function StatusSelect({
  atsProvider,
  boardSlug,
  externalId,
  status,
}: StatusSelectProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const key = jobKey(atsProvider, boardSlug, externalId);
  const serverStatus = isStatus(status) ? status : "new";
  const [, setTick] = useState(0);
  const current = localStatus.get(key) ?? serverStatus;

  useEffect(() => {
    if (localStatus.get(key) === serverStatus) {
      localStatus.delete(key);
    }
  }, [key, serverStatus]);

  return (
    <select
      name="status"
      value={current}
      onChange={(event) => {
        const next = event.target.value;
        if (!isStatus(next)) return;
        localStatus.set(key, next);
        setTick((tick) => tick + 1);
        startTransition(async () => {
          await updateJobStatus({
            atsProvider,
            boardSlug,
            externalId,
            status: next,
          });
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
