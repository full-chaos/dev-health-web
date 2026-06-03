import Link from "next/link";

import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

const AI_WORKFLOW_STEPS = [
	{
		label: "AI Impact",
		description: "Delivery lift versus review, rework, and incident drag.",
		href: "/ai",
	},
	{
		label: "Review Load / Risk",
		description: "Is AI-attributed work shifting cost into review or quality?",
		href: "/ai/review-load",
	},
	{
		label: "Governance gaps",
		description: "Unknown attribution and policy violations as trust signals.",
		href: "/ai/risk",
	},
	{
		label: "Evidence + intervention",
		description: "Move from recommendations into evidence and weekly review.",
		href: "/operating-review#ai_workflow_intelligence",
	},
];

type AiWorkflowCalloutProps = {
	filters: MetricFilter;
	activeRole: string;
	/**
	 * When true, the AI Workflow Intelligence block is rendered prominently as a
	 * full cockpit section. When false, the block is reduced to a single
	 * secondary link to /ai so AI work stays reachable without dominating the
	 * cockpit. The gating decision is made by `isAiDominant` (CHAOS-2051) and
	 * passed in here — this component does not decide prominence itself.
	 */
	prominent: boolean;
};

/**
 * AI Workflow Intelligence cockpit block (CHAOS-2051).
 *
 * Extracted verbatim from the cockpit home page so its prominence can be gated
 * on whether AI is the dominant signal. AI must remain reachable via PrimaryNav
 * and the /ai area regardless of this gate — the non-prominent variant keeps a
 * direct link.
 */
export function AiWorkflowCallout({
	filters,
	activeRole,
	prominent,
}: AiWorkflowCalloutProps) {
	if (!prominent) {
		return (
			<div
				data-testid="ai-workflow-secondary-link"
				className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3 text-sm text-(--ink-muted)"
			>
				<span>AI workflow signals are quiet in this window.</span>
				<Link
					href={withFilterParam("/ai", filters, activeRole)}
					className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
				>
					Open AI Workflows
				</Link>
			</div>
		);
	}

	return (
		<section
			data-testid="ai-workflow-callout"
			className="overflow-hidden rounded-[32px] border border-(--card-stroke) bg-(--card-80) p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.55)]"
		>
			<div className="flex flex-col gap-6">
				<div>
					<p className="text-xs uppercase tracking-[0.2em] text-(--accent-2)">
						Starting point
					</p>
					<h2 className="mt-3 text-xl leading-tight">
						AI Workflow Intelligence
					</h2>
					<p className="mt-3 text-sm leading-6 text-(--ink-muted)">
						See whether AI-assisted work is improving delivery or shifting cost
						into review, rework, and risk.
					</p>
					<div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em]">
						<Link
							href={withFilterParam("/ai", filters, activeRole)}
							className="rounded-full border border-(--card-stroke) bg-(--card) px-4 py-2 text-(--accent-2) transition hover:-translate-y-0.5"
						>
							Start with AI Impact
						</Link>
						<Link
							href={withFilterParam(
								"/operating-review#ai-workflow-intelligence",
								filters,
								activeRole,
							)}
							className="rounded-full border border-(--card-stroke) bg-(--card) px-4 py-2 text-(--accent-2) transition hover:-translate-y-0.5"
						>
							Weekly review
						</Link>
					</div>
				</div>
				<div className="grid min-w-0 flex-1 gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
					{AI_WORKFLOW_STEPS.map((step, index) => (
						<Link
							key={step.label}
							href={withFilterParam(step.href, filters, activeRole)}
							className="group rounded-2xl border border-(--card-stroke) bg-(--card) p-4 transition hover:-translate-y-1"
						>
							<div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
								<span>{String(index + 1).padStart(2, "0")}</span>
								<span className="text-(--accent-2)">Open</span>
							</div>
							<p className="mt-3 text-sm font-semibold text-foreground">
								{step.label}
							</p>
							<p className="mt-2 text-xs leading-5 text-(--ink-muted)">
								{step.description}
							</p>
						</Link>
					))}
				</div>
			</div>
		</section>
	);
}
