import Link from "next/link";
import { ArrowRight, Clock, Network } from "lucide-react";

import { buttonClassName } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

type DiagnoseQuestionsProps = {
    filters: MetricFilter;
    role?: string;
};

/**
 * "Follow a question into evidence" (approved prototype `diagnoseHub()`, no data): one section
 * card with the triage line under the title and a row of three buttons, each a route out of the
 * Diagnose overview. The button text is the prototype's own. Links carry the filters and role
 * like the area cards do.
 */
export function DiagnoseQuestions({ filters, role }: DiagnoseQuestionsProps) {
    const items = [
        {
            id: "work-graph",
            label: CTA_LABELS.exploreWorkGraph,
            icon: Network,
            href: withFilterParam("/diagnose/work-graph", filters, role),
        },
        {
            id: "review-latency",
            label: CTA_LABELS.inspectReviewLatency,
            icon: Clock,
            href: buildExploreUrl({ metric: "review_latency", filters, role }),
        },
        {
            id: "effort-allocation",
            label: CTA_LABELS.traceEffortAllocation,
            icon: ArrowRight,
            href: withFilterParam("/investment?tab=allocation", filters, role),
        },
    ];

    return (
        <Section
            data-testid="diagnose-questions"
            title="Follow a question into evidence"
            description="The overview is a triage surface. Each destination retains its own tabs and investigation views."
        >
            <div data-testid="diagnose-question-row" className="grid gap-4.5 md:grid-cols-3">
                {items.map(({ id, label, icon: Icon, href }) => (
                    <Link
                        key={id}
                        href={href}
                        data-question={id}
                        className={buttonClassName("secondary", "md")}
                    >
                        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                        {label}
                    </Link>
                ))}
            </div>
        </Section>
    );
}
