"use client";

import Link from "next/link";

import { ClientTimestamp } from "@/components/ClientTimestamp";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { buildThreadApiUrl } from "@/lib/cockpit/evidenceRef";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { scrubIdentifiers } from "@/lib/labels/entityLabel";
import { ReadFailedState } from "@/components/ui/ReadFailedState";
import type { HomeResponse } from "@/lib/types";

type HomeLongFormProps = {
    home: HomeResponse | null;
    filters: MetricFilter;
    activeRole: string;
};

const THREAD_API_TARGETS: Record<string, string> = {
    understand: "/api/v1/home",
    measure: "/api/v1/home",
    align: "/api/v1/investment",
    execute: "/api/v1/opportunities",
};

const getThreadEvidenceTarget = (
    key: string,
    tile: HomeResponse["tiles"][string],
    filters: MetricFilter,
) => {
    const thread = key.toLowerCase();
    const apiPath = THREAD_API_TARGETS[thread];
    if (apiPath) {
        return { apiUrl: buildThreadApiUrl(apiPath, filters, thread) };
    }

    return {
        apiUrl: tile.link.startsWith("/api/")
            ? tile.link
            : buildThreadApiUrl("/api/v1/home", filters, thread),
    };
};

const ITEM =
    "block w-full rounded-(--radius-sm) border border-(--card-stroke) bg-background px-4 py-3 text-left text-sm transition-colors hover:border-(--accent-2)";
const ACTION = "text-xs font-medium text-(--accent-2) underline-offset-4 hover:underline";
const HEAD = "text-[0.8125rem] font-semibold text-foreground";
const EMPTY =
    "rounded-(--radius-sm) border border-dashed border-(--card-stroke) bg-background px-4 py-3 text-sm text-(--ink-muted)";

/**
 * The long-form supporting sections of Home: Notable shifts, Investigation threads, Limiting
 * factor and Recent events. They are not blocks of the page body; the thread row "Recent events &
 * limiting factors" opens them in the shared evidence drawer (this is the drawer body).
 *
 * Content, links and evidence targets are the same as the old body sections. An item opens its
 * own evidence in the same drawer (the subject changes; the drawer stays one).
 */
export function HomeLongForm({ home, filters, activeRole }: HomeLongFormProps) {
    const evidence = useEvidenceDrawer();
    const open = (title: string, apiUrl?: string) => evidence.open({ title, apiUrl, filters });

    // A FAILED Home read (`null`): one failed-read state, not four "pending" sections (CHAOS-9189).
    if (home === null) {
        return (
            <div data-testid="home-long-form">
                <ReadFailedState compact headingLevel={4} data-testid="long-form-read-failed" />
            </div>
        );
    }

    // A blank sentence (empty, null, whitespace) is not a shift: it draws no button.
    const sentences = (home?.summary ?? []).filter((sentence) => sentence.text?.trim());

    const limitingClaim =
        home?.limiting_factor?.claim ??
        home?.constraint?.claim ??
        "Evidence will appear once data is ingested.";

    return (
        <div className="space-y-6" data-testid="home-long-form">
            <section aria-labelledby="long-form-notable" data-testid="long-form-notable-shifts">
                <h4 id="long-form-notable" className={HEAD}>
                    Notable shifts
                </h4>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    Short shifts from the selected window.
                </p>
                <div className="mt-3 space-y-2">
                    {sentences.map((sentence, idx) => (
                        <button
                            type="button"
                            key={sentence.id ?? sentence.text ?? idx}
                            onClick={() => open("Notable Shift", sentence.evidence_link)}
                            className={`${ITEM} text-(--ink-muted)`}
                        >
                            {scrubIdentifiers(sentence.text).text}
                        </button>
                    ))}
                    {sentences.length === 0 && (
                        <p className={EMPTY}>Summary will appear once data is ingested.</p>
                    )}
                </div>
            </section>

            <section aria-labelledby="long-form-threads" data-testid="long-form-threads">
                <div className="flex items-center justify-between gap-3">
                    <h4 id="long-form-threads" className={HEAD}>
                        Investigation threads
                    </h4>
                    <Link
                        href={withFilterParam("/opportunities", filters, activeRole)}
                        className={ACTION}
                    >
                        {CTA_LABELS.viewAll}
                    </Link>
                </div>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    {home?.constraint?.title ?? "Constraint pending"}
                </p>
                <div className="mt-3 space-y-2">
                    {home?.tiles
                        ? Object.entries(home.tiles).map(([key, tile]) => (
                              <button
                                  type="button"
                                  key={key}
                                  onClick={() =>
                                      open(
                                          tile.title,
                                          getThreadEvidenceTarget(key, tile, filters).apiUrl,
                                      )
                                  }
                                  className={ITEM}
                              >
                                  <span className="block text-label-caps uppercase text-(--ink-muted)">
                                      {tile.title}
                                  </span>{" "}
                                  <span className="mt-1 block font-semibold text-foreground">
                                      {tile.subtitle}
                                  </span>{" "}
                                  <span className="mt-2 block text-xs text-(--ink-muted)">
                                      {CTA_LABELS.evidence}
                                  </span>
                              </button>
                          ))
                        : null}
                    <Link
                        href={withFilterParam("/opportunities", filters, activeRole)}
                        className="block rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface-raised) px-4 py-3"
                    >
                        <span className="block text-label-caps uppercase text-(--ink-muted)">
                            Focus thread
                        </span>{" "}
                        <span className="mt-1 block text-sm font-semibold text-foreground">
                            {home?.constraint?.title ?? "Constraint pending"}
                        </span>{" "}
                        <span className="mt-1 block text-sm text-(--ink-muted)">
                            {home?.constraint?.claim ?? "Limiting factor pending."}
                        </span>
                    </Link>
                </div>
            </section>

            <section aria-labelledby="long-form-limiting" data-testid="long-form-limiting-factor">
                <div className="flex items-center justify-between gap-3">
                    <h4 id="long-form-limiting" className={HEAD}>
                        Limiting factor
                    </h4>
                    <button
                        type="button"
                        onClick={() =>
                            open(
                                "Limiting Factor",
                                home?.limiting_factor?.evidence_ref ?? undefined,
                            )
                        }
                        className={ACTION}
                    >
                        {CTA_LABELS.openEvidence}
                    </button>
                </div>
                <p className="mt-2 text-sm text-(--ink-muted)">{limitingClaim}</p>
                {home?.limiting_factor?.why_it_matters ? (
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        {home.limiting_factor.why_it_matters}
                    </p>
                ) : null}
                {home?.limiting_factor?.recommended_action ? (
                    <div className="mt-3 rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface-raised) p-3">
                        <p className="text-xs font-semibold text-foreground">Recommended action</p>
                        <p className="mt-1 text-sm leading-5 text-foreground">
                            {home.limiting_factor.recommended_action}
                        </p>
                    </div>
                ) : null}
                <div className="mt-3 space-y-2">
                    {(home?.constraint?.evidence ?? []).map((item) => (
                        <button
                            type="button"
                            key={`${item.label}-${item.link}`}
                            onClick={() => open(item.label, item.link)}
                            className={ITEM}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-(--ink-muted)">
                    {(home?.constraint?.experiments ?? []).map((experiment) => (
                        <span
                            key={experiment}
                            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-3 py-1"
                        >
                            {experiment}
                        </span>
                    ))}
                </div>
            </section>

            <section aria-labelledby="long-form-events" data-testid="long-form-recent-events">
                <div className="flex items-center justify-between gap-3">
                    <h4 id="long-form-events" className={HEAD}>
                        Recent events
                    </h4>
                    <Link href={buildExploreUrl({ filters, role: activeRole })} className={ACTION}>
                        {CTA_LABELS.openEvidence}
                    </Link>
                </div>
                <div className="mt-3 space-y-2">
                    {(home?.events ?? []).map((event) => (
                        <button
                            type="button"
                            key={`${event.type}-${event.ts}-${event.text}`}
                            onClick={() => open(event.type, event.link)}
                            className={ITEM}
                        >
                            <span className="flex items-center justify-between text-label-caps uppercase text-(--ink-muted)">
                                <span>{event.type}</span> <ClientTimestamp value={event.ts} />
                            </span>{" "}
                            <span className="mt-2 block text-foreground">{event.text}</span>
                        </button>
                    ))}
                    {!home?.events?.length && (
                        <p className={EMPTY}>No major shifts detected in the current window.</p>
                    )}
                </div>
            </section>
        </div>
    );
}
