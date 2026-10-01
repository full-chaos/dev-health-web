"use client";

import { useEffect, useState } from "react";

import { ClientTimestamp } from "@/components/ClientTimestamp";
import { apiClient } from "@/lib/apiClient";
import type { MetaResponse } from "@/lib/types";

/**
 * Data-freshness chip of the shell top bar.
 *
 * It states a fact (when data was last synced) and never a health verdict. A
 * failed request, an empty answer or a value that is not a date is `unknown`,
 * shown as neutral: the chip must not look healthy when the state is not known.
 */
export type ShellStatus =
    { kind: "loading" } | { kind: "unknown" } | { kind: "empty" } | { kind: "synced"; at: string };

/** Map the meta answer to a chip state. Anything not understood is `unknown`. */
export function shellStatusFromMeta(meta: unknown): ShellStatus {
    if (typeof meta !== "object" || meta === null || !("last_ingest_at" in meta)) {
        return { kind: "unknown" };
    }
    const lastIngestAt: unknown = (meta as Record<string, unknown>).last_ingest_at;
    if (lastIngestAt === null) return { kind: "empty" };
    if (typeof lastIngestAt !== "string" || Number.isNaN(Date.parse(lastIngestAt))) {
        return { kind: "unknown" };
    }
    return { kind: "synced", at: lastIngestAt };
}

const DOT_CLASS: Record<ShellStatus["kind"], string> = {
    loading: "bg-(--text-muted)",
    unknown: "bg-(--text-muted)",
    empty: "bg-(--caution)",
    synced: "bg-(--info)",
};

export function ShellStatusChip() {
    const [status, setStatus] = useState<ShellStatus>({ kind: "loading" });

    useEffect(() => {
        let active = true;
        apiClient
            .getJson<MetaResponse>("/api/v1/meta")
            .then((meta) => {
                if (active) setStatus(shellStatusFromMeta(meta));
            })
            .catch(() => {
                if (active) setStatus({ kind: "unknown" });
            });
        return () => {
            active = false;
        };
    }, []);

    return (
        <p
            data-testid="shell-status-chip"
            data-status={status.kind}
            aria-busy={status.kind === "loading"}
            className="flex items-center gap-2 rounded-(--radius-pill) border border-(--border) px-3 py-1 text-xs text-(--text-secondary)"
        >
            <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-(--radius-pill) ${DOT_CLASS[status.kind]}`}
            />
            {status.kind === "loading" ? "Checking data status" : null}
            {status.kind === "unknown" ? "Status unavailable" : null}
            {status.kind === "empty" ? "No data yet" : null}
            {status.kind === "synced" ? (
                <ClientTimestamp value={status.at} prefix="Synced " />
            ) : null}
        </p>
    );
}
