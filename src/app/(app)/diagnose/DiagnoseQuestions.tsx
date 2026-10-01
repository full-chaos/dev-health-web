import Link from "next/link";

import { CTA_LABELS } from "@/lib/design/cta";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

type DiagnoseQuestionsProps = {
    filters: MetricFilter;
    role?: string;
};

/**
 * "Follow a question into evidence" (approved concept, no data): three static
 * routes out of the Diagnose overview. Links carry the filters and role like the
 * area cards do. Each link's accessible name is its caption plus its registry
 * label, so "Open evidence" reads differently from the other two.
 */
export function DiagnoseQuestions({ filters, role }: DiagnoseQuestionsProps) {
    const items = [
        {
            id: "work-graph",
            caption: "Work graph",
            label: CTA_LABELS.openWorkGraph,
            href: withFilterParam("/diagnose/work-graph", filters, role),
        },
        {
            id: "review-latency",
            caption: "Review latency",
            label: CTA_LABELS.openEvidence,
            href: buildExploreUrl({ metric: "review_latency", filters, role }),
        },
        {
            id: "effort-allocation",
            caption: "Effort allocation",
            label: CTA_LABELS.openInvestment,
            href: withFilterParam("/investment?tab=allocation", filters, role),
        },
    ];

    return (
        <section aria-labelledby="diagnose-questions-title" data-testid="diagnose-questions">
            <h2 id="diagnose-questions-title" className="text-h3 font-semibold text-foreground">
                Follow a question into evidence
            </h2>
            <div className="mt-3 grid gap-3.5 md:grid-cols-3">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className="flex flex-col items-start gap-3 rounded-(--radius-md) border border-(--card-stroke) bg-(--card) p-4.75"
                    >
                        <p
                            id={`diagnose-q-${item.id}`}
                            className="text-label-caps uppercase text-(--ink-muted)"
                        >
                            {item.caption}
                        </p>
                        <Link
                            id={`diagnose-q-${item.id}-link`}
                            href={item.href}
                            aria-labelledby={`diagnose-q-${item.id} diagnose-q-${item.id}-link`}
                            className="rounded-(--radius-sm) border border-(--card-stroke) px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                        >
                            {item.label}
                        </Link>
                    </div>
                ))}
            </div>
            <p className="mt-3 text-xs text-(--ink-muted)">
                The overview is a triage surface. Each destination retains its own tabs and
                investigation views.
            </p>
        </section>
    );
}
