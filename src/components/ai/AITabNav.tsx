"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

/**
 * Route-based tab strip for the unified AI Workflows area.
 *
 * Convention follows the route-per-tab pattern used by TestOps (each tab is
 * its own `/ai/*` route) rather than the `?tab=` query pattern used by
 * `/metrics`. This was chosen because every AI tab already maps to a distinct
 * data surface / dashboard, and keeping discrete routes preserves the
 * previously-reachable URLs (`/ai/review-load`, `/ai/risk`, …) as deep links.
 *
 * `preview` tabs have no distinct backing data yet and render a clearly-scoped
 * preview surface — never a blank or broken destination.
 */
export type AITabId =
	| "impact"
	| "attribution"
	| "review-load"
	| "test-gaps"
	| "risk"
	| "evidence"
	| "automations";

type AITab = {
	id: AITabId;
	label: string;
	href: string;
	preview?: boolean;
};

const AI_TABS: AITab[] = [
	{ id: "impact", label: "Impact", href: "/ai" },
	{
		id: "attribution",
		label: "Attribution",
		href: "/ai/attribution",
		preview: true,
	},
	{ id: "review-load", label: "Review Load", href: "/ai/review-load" },
	{ id: "test-gaps", label: "Test Gaps", href: "/ai/test-gaps", preview: true },
	{ id: "risk", label: "Governance Risk", href: "/ai/risk" },
	{ id: "evidence", label: "Evidence", href: "/ai/evidence", preview: true },
	{ id: "automations", label: "Automations", href: "/ai/automations" },
];

/** Resolve the active tab from the current pathname. `/ai` maps to Impact. */
function activeTabFromPath(pathname: string): AITabId {
	if (pathname === "/ai" || pathname === "/ai/impact") return "impact";
	const match = AI_TABS.find(
		(tab) =>
			tab.href !== "/ai" &&
			(pathname === tab.href || pathname.startsWith(tab.href + "/")),
	);
	return match?.id ?? "impact";
}

type AITabNavProps = {
	filters: MetricFilter;
	role?: string;
};

export function AITabNav({ filters, role }: AITabNavProps) {
	const pathname = usePathname();
	const activeTab = activeTabFromPath(pathname);

	return (
		<nav
			aria-label="AI Workflows"
			className="flex items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-(--card-stroke) px-1 scrollbar-hide"
		>
			{AI_TABS.map((tab) => {
				const isActive = activeTab === tab.id;
				const href = withFilterParam(tab.href, filters, role);

				return (
					<Link
						key={tab.id}
						href={href}
						aria-current={isActive ? "page" : undefined}
						className={`-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-[10px] uppercase tracking-[0.18em] transition-all ${
							isActive
								? "border-(--accent) text-foreground font-semibold"
								: "border-transparent text-(--ink-muted) hover:border-(--card-stroke) hover:text-foreground"
						}`}
					>
						{tab.label}
						{tab.preview && (
							<span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.12em] text-(--ink-muted)">
								Preview
							</span>
						)}
					</Link>
				);
			})}
		</nav>
	);
}
