"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { SeverityBadge } from "./SeverityBadge";
import { SourceBadge } from "./SourceBadge";
import { StateBadge } from "./StateBadge";
import type { SecurityAlertRowData } from "./types";
import { buildRepoHref } from "./repoLink";

type SecurityAlertRowProps = {
    alert: SecurityAlertRowData;
};

/** Returns a short relative age string, e.g. "3d ago", "2h ago", "just now". */
function relativeAge(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(diffMs) || diffMs < 0) return "";
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
}

const CELL = "px-3 py-2 align-middle";

/**
 * One row of the alert queue table. The provider page is a real link in the
 * Alert cell (keyboard, new tab, `noopener noreferrer`): there is no click
 * handler on the row and no link laid over it. The repository is a separate
 * link in its own cell; no interactive element is nested in another.
 */
export function SecurityAlertRow({ alert }: SecurityAlertRowProps) {
    const { repoId, repoName, url, source, severity, state, packageName, cveId, title, createdAt } =
        alert;

    const searchParams = useSearchParams();
    const f = searchParams.get("f") ?? undefined;
    const label = title?.trim() || cveId || packageName || "Untitled alert";

    const chip = packageName ? (
        <span className="max-w-30 truncate rounded-(--radius-sm) bg-(--surface-raised) px-1.5 py-0.5 font-mono text-xs text-(--text-muted)">
            {packageName}
        </span>
    ) : cveId ? (
        <span className="rounded-(--radius-sm) bg-(--surface-raised) px-1.5 py-0.5 font-mono text-xs text-(--text-muted)">
            {cveId}
        </span>
    ) : null;

    const externalIcon = (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 opacity-60"
            aria-hidden="true"
        >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
    );

    return (
        <tr className="border-b border-(--border) text-sm transition-colors hover:bg-(--surface-raised)">
            <td className={CELL}>
                <SeverityBadge severity={severity} />
            </td>
            <td className={CELL}>
                <SourceBadge source={source} />
            </td>
            <td className={`${CELL} min-w-0 max-w-md`}>
                {url ? (
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={label}
                        className="inline-flex max-w-full items-center gap-1.5 text-(--accent-2) hover:underline"
                    >
                        <span className="truncate">{label}</span>
                        {externalIcon}
                        <span className="sr-only">(opens in a new tab)</span>
                    </a>
                ) : (
                    <span className="block truncate" title={label}>
                        {label}
                    </span>
                )}
            </td>
            <td className={CELL}>{chip}</td>
            <td className={CELL}>
                <Link
                    href={buildRepoHref(repoId, f)}
                    className="block max-w-36 truncate text-xs text-(--accent-2) hover:underline"
                >
                    {repoName}
                </Link>
            </td>
            <td className={CELL}>
                <StateBadge state={state} />
            </td>
            <td className={`${CELL} text-xs text-(--text-muted)`}>{relativeAge(createdAt)}</td>
        </tr>
    );
}
