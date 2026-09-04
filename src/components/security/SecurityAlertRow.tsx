"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
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

const ROW_BASE =
    "grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto_auto] items-center gap-x-3 border-b border-[var(--card-stroke)] px-3 py-2 text-sm transition-colors hover:bg-[var(--card-70)]";

export function SecurityAlertRow({ alert }: SecurityAlertRowProps) {
    const [isHovered, setIsHovered] = useState(false);
    const {
        alertId,
        repoId,
        repoName,
        url,
        source,
        severity,
        state,
        packageName,
        cveId,
        title,
        createdAt,
    } = alert;

    const searchParams = useSearchParams();
    const f = searchParams.get("f") ?? undefined;

    const stopPropagation = (e: MouseEvent) => e.stopPropagation();

    const chip = packageName ? (
        <span className="max-w-30 truncate rounded bg-[var(--card-70)] px-1.5 py-0.5 font-mono text-xs text-[var(--ink-muted)]">
            {packageName}
        </span>
    ) : cveId ? (
        <span className="rounded bg-[var(--card-70)] px-1.5 py-0.5 font-mono text-xs text-[var(--ink-muted)]">
            {cveId}
        </span>
    ) : null;

    const repoLink = (
        <Link
            href={buildRepoHref(repoId, f)}
            onClick={stopPropagation}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="max-w-36 truncate text-xs text-[var(--ink-muted)] hover:underline"
        >
            {repoName}
        </Link>
    );

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
            className="shrink-0 text-[var(--ink-muted)] opacity-60"
            aria-hidden="true"
        >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
    );

    const inner = (
        <div className={`${ROW_BASE} ${isHovered ? "bg-[var(--card-70)]" : ""}`}>
            <SeverityBadge severity={severity} />
            <SourceBadge source={source} />
            <span className="min-w-0 truncate" title={title ?? alertId}>
                {title ?? alertId}
            </span>
            <span className="flex shrink-0">{chip}</span>
            <span className="relative z-20 shrink-0">{repoLink}</span>
            <StateBadge state={state} />
            <span className="shrink-0 text-xs text-[var(--ink-muted)]">
                {relativeAge(createdAt)}
            </span>
            {externalIcon}
        </div>
    );

    if (url) {
        const handleRowClick = (event: MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            window.open(url, "_blank", "noopener,noreferrer");
        };
        return (
            <div className="relative">
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 z-10"
                    aria-label={`${title ?? alertId} — opens in new tab`}
                    title={title ?? alertId}
                    onClick={handleRowClick}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    <span className="sr-only">Open alert details</span>
                </a>
                {inner}
            </div>
        );
    }

    return <div>{inner}</div>;
}
