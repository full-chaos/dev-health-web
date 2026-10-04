"use client";

import { ArrowUpRight } from "lucide-react";

import { buttonClassName } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber } from "@/lib/formatters";
import type { ExplainRepository } from "@/lib/types";

import { NOT_REPORTED } from "./EvidenceFacts";

// CHAOS-8587 (web half of CHAOS-8103). Every text here is served: the name, the value (with the
// unit of the answer) and the provider URL. The web builds no value and no URL. The row's own
// `source_url` is not drawn: the drawer has one action, the top-level `source_url`.

export const EVIDENCE_REPOSITORIES_TITLE = "Supporting repositories";

/**
 * The served provider URL when it is an absolute https URL with a host; else null (no link).
 * (The URL parser already refuses an https URL with no host; a URL with user info is refused here.) The string that is returned is the served one, unchanged: the web builds no URL.
 */
export function servedSourceUrl(value: string | null | undefined): string | null {
    if (typeof value !== "string" || value === "") return null;
    try {
        const url = new URL(value);
        // No user info: a URL with credentials in it is never linked.
        return url.protocol === "https:" && url.username === "" && url.password === ""
            ? value
            : null;
    } catch {
        return null;
    }
}

type EvidenceRepositoriesProps = {
    /** null / undefined: the metric is stored per team (or an older answer): no section. */
    repositories?: ExplainRepository[] | null;
    unit?: string;
};

/** "Supporting repositories": one fact-style row per served repository. [] reads "Not reported". */
export function EvidenceRepositories({ repositories, unit }: EvidenceRepositoriesProps) {
    if (!Array.isArray(repositories)) return null;
    return (
        <section data-testid="evidence-repositories" className="text-xs">
            <h4 className="text-xs font-semibold text-foreground">{EVIDENCE_REPOSITORIES_TITLE}</h4>
            {repositories.length === 0 ? (
                <p className="mt-1 text-(--ink-muted)">{NOT_REPORTED}</p>
            ) : (
                <ul className="mt-1">
                    {repositories.map((repo) => {
                        const hasValue = Number.isFinite(repo.value);
                        return (
                            <li
                                key={repo.id}
                                data-testid="evidence-repository-row"
                                className="flex items-start gap-x-3 border-b border-(--card-stroke) py-2.5 last:border-b-0"
                            >
                                <span
                                    className={`min-w-0 ${repo.name ? "text-foreground" : "text-(--ink-muted)"}`}
                                >
                                    {repo.name || NOT_REPORTED}
                                </span>
                                <span
                                    className={`ml-auto shrink-0 text-right tabular-nums ${hasValue ? "font-semibold text-foreground" : "text-(--ink-muted)"}`}
                                >
                                    {hasValue
                                        ? `${formatNumber(repo.value)}${unit ? ` ${unit}` : ""}`
                                        : NOT_REPORTED}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

/** "View original source": the served provider page, in a new tab. Nothing when no usable URL. */
export function EvidenceSourceLink({ url }: { url?: string | null }) {
    const href = servedSourceUrl(url);
    if (!href) return null;
    return (
        <div data-testid="evidence-source-link">
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClassName("secondary", "md")}
            >
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                {CTA_LABELS.viewOriginalSource}
            </a>
        </div>
    );
}
