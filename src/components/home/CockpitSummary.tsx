"use client";

import { ArrowRight } from "lucide-react";

import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { PrimarySignalHero } from "@/components/navigation/PrimarySignalHero";
import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import { scrubIdentifiers } from "@/lib/labels/entityLabel";
import { isRiskSignal } from "@/lib/cockpit/signalKinds";
import { coverageNote } from "@/lib/metrics/coverageNote";
import { NOT_FILTERED_BY_REPOSITORY, isRepoUnscopedMetric } from "@/lib/metrics/repoScope";
import type { HomeResponse } from "@/lib/types";

import { CockpitEmptyState } from "./CockpitEmptyState";
import { SignalEvidenceIntro } from "./SignalEvidenceIntro";

/**
 * Primary-signal hero of Home (approved prototype `cockpit()`: `hero(...)`, `app.js:100`).
 *
 * The top ranked signal (`signals[0]`, ranked by the API) in the shared `PrimarySignalHero`:
 * severity, the served title, the served change as the big value, the comparison window, the
 * served current and previous values, and one primary "Open evidence" action that opens the
 * shared evidence drawer for that signal.
 *
 * Every value is shown as served. The web computes no number here.
 */

type CockpitSummaryProps = {
    home: HomeResponse | null;
    filters: MetricFilter;
};

export function CockpitSummary({ home, filters }: CockpitSummaryProps) {
    const evidence = useEvidenceDrawer();

    if (home?.health_state?.status === "no_data") {
        return (
            <section data-testid="cockpit-summary" aria-label="Primary signal">
                <CockpitEmptyState variant="no-data-window" data-testid="cockpit-no-data" />
            </section>
        );
    }

    const topSignal = home?.signals?.[0];

    if (!topSignal) {
        // No health state served (home absent, or no `health_state`) is a no-data state, never
        // "Enabled but no findings": only a served state may say that (CHAOS-9154).
        if (!home?.health_state) {
            return (
                <section data-testid="cockpit-summary" aria-label="Primary signal">
                    <CockpitEmptyState variant="no-data-window" data-testid="cockpit-no-data" />
                </section>
            );
        }
        return (
            <section data-testid="cockpit-summary" aria-label="Primary signal">
                <CockpitEmptyState variant="no-findings" data-testid="cockpit-top-change-empty" />
            </section>
        );
    }

    // A raw identifier inside the served sentence is shortened, as the page did before.
    const title = scrubIdentifiers(topSignal.title).text;
    const compareDays = filters.time.compare_days;
    const hasPrior = topSignal.prior_value != null && topSignal.prior_value !== "";

    return (
        <section data-testid="cockpit-summary" aria-label="Primary signal">
            <PrimarySignalHero
                signal={{
                    id: topSignal.id,
                    label: title,
                    // Not drawn: the hero's action is the evidence button below.
                    href: "/explore",
                    // The comparison window the page asked for (a request parameter).
                    metricLabel: `vs previous ${compareDays} ${compareDays === 1 ? "day" : "days"}${
                        isRepoUnscopedMetric(topSignal.metric, filters, topSignal)
                            ? ` · ${NOT_FILTERED_BY_REPOSITORY}`
                            : ""
                    }${
                        isRiskSignal(topSignal) && coverageNote(topSignal.coverage)
                            ? ` · ${coverageNote(topSignal.coverage)}`
                            : ""
                    }`,
                    // The change exactly as served. No value node when the API served none.
                    value: topSignal.delta ?? "",
                    driver: hasPrior
                        ? `${topSignal.current_value} from ${topSignal.prior_value}`
                        : topSignal.current_value,
                    state: topSignal.severity,
                }}
                filters={filters}
                // The hero comes right after the page title: no heading level is skipped.
                titleAs="h2"
                action={
                    <Button
                        variant="primary"
                        icon={<ArrowRight />}
                        data-testid="cockpit-top-change-evidence"
                        onClick={() =>
                            evidence.open({
                                title,
                                apiUrl: topSignal.evidence_ref || undefined,
                                metric: topSignal.metric,
                                filters,
                                intro: <SignalEvidenceIntro signal={topSignal} />,
                            })
                        }
                    >
                        {CTA_LABELS.openEvidence}
                    </Button>
                }
            />
        </section>
    );
}
