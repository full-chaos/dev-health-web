"use client";

import { ClientTimestamp } from "@/components/ClientTimestamp";
import type { ActiveOrganizationData } from "@/components/navigation/OrgSwitcher";

/**
 * Data-freshness chip of the shell top bar.
 *
 * It states a fact about the active organization's data and never a health
 * verdict. The source is the same answer the organization card shows, so the
 * two cannot disagree. A failed request, an organization that is not in the
 * list, or a value that is not understood is `unknown`, shown as neutral: the
 * chip must not look healthy, or empty, when the state is not known.
 */
export type ShellStatus =
    | { kind: "loading" }
    | { kind: "unknown" }
    | { kind: "empty" }
    | { kind: "present" }
    | { kind: "synced"; at: string };

/** Map the active organization's data state to a chip state. */
export function shellStatusFromOrganization(organization: unknown): ShellStatus {
    if (typeof organization !== "object" || organization === null) {
        return { kind: "unknown" };
    }
    const { hasData, lastMetricsAt } = organization as Partial<
        Record<keyof ActiveOrganizationData, unknown>
    >;
    if (typeof hasData !== "boolean") return { kind: "unknown" };
    if (!hasData) return { kind: "empty" };
    if (typeof lastMetricsAt !== "string" || Number.isNaN(Date.parse(lastMetricsAt))) {
        return { kind: "present" };
    }
    return { kind: "synced", at: lastMetricsAt };
}

const DOT_CLASS: Record<ShellStatus["kind"], string> = {
    loading: "bg-(--text-muted)",
    unknown: "bg-(--text-muted)",
    empty: "bg-(--caution)",
    present: "bg-(--info)",
    synced: "bg-(--info)",
};

export function ShellStatusChip({ status }: { status: ShellStatus }) {
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
            {status.kind === "present" ? "Has data" : null}
            {status.kind === "synced" ? (
                <ClientTimestamp value={status.at} prefix="Data through " />
            ) : null}
        </p>
    );
}
