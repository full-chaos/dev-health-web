import type { ChordRecord } from "@/lib/types";

import type {
	FlowTransitionSummary,
	WorkItemFlowEfficiencyDaily,
	WorkItemMetricsDaily,
	WorkItemStatusTransitionSummary,
	WorkItemTypeByScope,
	WorkItemTypeSummary,
} from "./devHealthOpsTypes";

export const workItemMetricsDailySample: WorkItemMetricsDaily[] = [
	{
		day: "2025-02-10",
		provider: "github",
		teamId: "core",
		teamName: "Core",
		workScopeId: "auth",
		itemsStarted: 5,
		itemsCompleted: 4,
		wipCountEndOfDay: 9,
		itemsCompletedUnassigned: 1,
		bugCompletedRatio: 0.2,
		predictabilityScore: 0.31,
	},
	{
		day: "2025-02-11",
		provider: "github",
		teamId: "core",
		teamName: "Core",
		workScopeId: "auth",
		itemsStarted: 6,
		itemsCompleted: 5,
		wipCountEndOfDay: 8,
		itemsCompletedUnassigned: 0,
		bugCompletedRatio: 0.18,
		predictabilityScore: 0.38,
	},
	{
		day: "2025-02-12",
		provider: "github",
		teamId: "core",
		teamName: "Core",
		workScopeId: "auth",
		itemsStarted: 8,
		itemsCompleted: 6,
		wipCountEndOfDay: 11,
		itemsCompletedUnassigned: 1,
		bugCompletedRatio: 0.22,
		predictabilityScore: 0.35,
	},
	{
		day: "2025-02-13",
		provider: "github",
		teamId: "core",
		teamName: "Core",
		workScopeId: "auth",
		itemsStarted: 7,
		itemsCompleted: 7,
		wipCountEndOfDay: 10,
		itemsCompletedUnassigned: 1,
		bugCompletedRatio: 0.16,
		predictabilityScore: 0.41,
	},
	{
		day: "2025-02-14",
		provider: "github",
		teamId: "core",
		teamName: "Core",
		workScopeId: "auth",
		itemsStarted: 9,
		itemsCompleted: 8,
		wipCountEndOfDay: 12,
		itemsCompletedUnassigned: 0,
		bugCompletedRatio: 0.19,
		predictabilityScore: 0.4,
	},
	{
		day: "2025-02-15",
		provider: "github",
		teamId: "core",
		teamName: "Core",
		workScopeId: "auth",
		itemsStarted: 10,
		itemsCompleted: 9,
		wipCountEndOfDay: 11,
		itemsCompletedUnassigned: 0,
		bugCompletedRatio: 0.17,
		predictabilityScore: 0.45,
	},
	{
		day: "2025-02-15",
		provider: "github",
		teamId: "platform",
		teamName: "Platform",
		workScopeId: "api",
		itemsStarted: 12,
		itemsCompleted: 10,
		wipCountEndOfDay: 15,
		itemsCompletedUnassigned: 2,
		bugCompletedRatio: 0.21,
		predictabilityScore: 0.34,
	},
	{
		day: "2025-02-15",
		provider: "github",
		teamId: "growth",
		teamName: "Growth",
		workScopeId: "ui",
		itemsStarted: 8,
		itemsCompleted: 7,
		wipCountEndOfDay: 9,
		itemsCompletedUnassigned: 1,
		bugCompletedRatio: 0.12,
		predictabilityScore: 0.44,
	},
	{
		day: "2025-02-15",
		provider: "github",
		teamId: "data",
		teamName: "Data",
		workScopeId: "data",
		itemsStarted: 9,
		itemsCompleted: 8,
		wipCountEndOfDay: 10,
		itemsCompletedUnassigned: 0,
		bugCompletedRatio: 0.09,
		predictabilityScore: 0.47,
	},
	{
		day: "2025-02-15",
		provider: "github",
		teamId: "ops",
		teamName: "Ops",
		workScopeId: "ops",
		itemsStarted: 6,
		itemsCompleted: 5,
		wipCountEndOfDay: 7,
		itemsCompletedUnassigned: 1,
		bugCompletedRatio: 0.25,
		predictabilityScore: 0.33,
	},
	{
		day: "2025-02-15",
		provider: "github",
		teamId: "docs",
		teamName: "Docs",
		workScopeId: "docs",
		itemsStarted: 4,
		itemsCompleted: 3,
		wipCountEndOfDay: 4,
		itemsCompletedUnassigned: 0,
		bugCompletedRatio: 0.05,
		predictabilityScore: 0.52,
	},
];

export const workItemFlowEfficiencyDailySample: WorkItemFlowEfficiencyDaily[] =
	[
		{
			day: "2025-02-15",
			provider: "github",
			teamId: "platform",
			teamName: "Platform",
			workScopeId: "api",
			flowEfficiency: 0.78,
		},
		{
			day: "2025-02-15",
			provider: "github",
			teamId: "growth",
			teamName: "Growth",
			workScopeId: "ui",
			flowEfficiency: 0.68,
		},
		{
			day: "2025-02-15",
			provider: "github",
			teamId: "core",
			teamName: "Core",
			workScopeId: "auth",
			flowEfficiency: 0.72,
		},
		{
			day: "2025-02-15",
			provider: "github",
			teamId: "infra",
			teamName: "Infra",
			workScopeId: "ops",
			flowEfficiency: 0.61,
		},
		{
			day: "2025-02-15",
			provider: "github",
			teamId: "mobile",
			teamName: "Mobile",
			workScopeId: "ui",
			flowEfficiency: 0.57,
		},
		{
			day: "2025-02-15",
			provider: "github",
			teamId: "data",
			teamName: "Data",
			workScopeId: "data",
			flowEfficiency: 0.64,
		},
	];

export const workItemTypeSummarySample: WorkItemTypeSummary[] = [
	{
		provider: "github",
		teamId: "core",
		workScopeId: "auth",
		type: "story",
		count: 34,
	},
	{
		provider: "github",
		teamId: "core",
		workScopeId: "auth",
		type: "task",
		count: 20,
	},
	{
		provider: "github",
		teamId: "core",
		workScopeId: "auth",
		type: "bug",
		count: 18,
	},
	{
		provider: "github",
		teamId: "core",
		workScopeId: "auth",
		type: "chore",
		count: 12,
	},
	{
		provider: "github",
		teamId: "core",
		workScopeId: "auth",
		type: "incident",
		count: 8,
	},
];

export const workItemTypeByScopeSample: WorkItemTypeByScope[] = [
	{
		provider: "github",
		teamId: "core",
		workScopeId: "feature work",
		type: "story",
		count: 18,
	},
	{
		provider: "github",
		teamId: "core",
		workScopeId: "feature work",
		type: "task",
		count: 14,
	},
	{
		provider: "github",
		teamId: "core",
		workScopeId: "feature work",
		type: "bug",
		count: 10,
	},
	{
		provider: "github",
		teamId: "platform",
		workScopeId: "platform",
		type: "task",
		count: 10,
	},
	{
		provider: "github",
		teamId: "platform",
		workScopeId: "platform",
		type: "chore",
		count: 8,
	},
	{
		provider: "github",
		teamId: "platform",
		workScopeId: "platform",
		type: "incident",
		count: 6,
	},
	{
		provider: "github",
		teamId: "reliability",
		workScopeId: "reliability",
		type: "incident",
		count: 8,
	},
	{
		provider: "github",
		teamId: "reliability",
		workScopeId: "reliability",
		type: "bug",
		count: 6,
	},
	{
		provider: "github",
		teamId: "reliability",
		workScopeId: "reliability",
		type: "task",
		count: 4,
	},
	{
		provider: "github",
		teamId: "research",
		workScopeId: "research",
		type: "epic",
		count: 6,
	},
	{
		provider: "github",
		teamId: "research",
		workScopeId: "research",
		type: "story",
		count: 4,
	},
	{
		provider: "github",
		teamId: "operations",
		workScopeId: "operations",
		type: "chore",
		count: 4,
	},
	{
		provider: "github",
		teamId: "operations",
		workScopeId: "operations",
		type: "incident",
		count: 2,
	},
];

export const workItemStatusTransitionSample: WorkItemStatusTransitionSummary[] =
	[
		{
			provider: "github",
			teamId: "core",
			workScopeId: "auth",
			fromStatus: "backlog",
			toStatus: "in_progress",
			count: 32,
		},
		{
			provider: "github",
			teamId: "core",
			workScopeId: "auth",
			fromStatus: "in_progress",
			toStatus: "in_review",
			count: 22,
		},
		{
			provider: "github",
			teamId: "core",
			workScopeId: "auth",
			fromStatus: "in_review",
			toStatus: "done",
			count: 18,
		},
		{
			provider: "github",
			teamId: "core",
			workScopeId: "auth",
			fromStatus: "backlog",
			toStatus: "blocked",
			count: 6,
		},
		{
			provider: "github",
			teamId: "core",
			workScopeId: "auth",
			fromStatus: "blocked",
			toStatus: "in_progress",
			count: 4,
		},
		{
			provider: "github",
			teamId: "core",
			workScopeId: "auth",
			fromStatus: "backlog",
			toStatus: "todo",
			count: 14,
		},
	];

export const sankeyStateTransitionSample: FlowTransitionSummary[] = [
	{
		fromStatus: "Issue_backlog",
		toStatus: "Issue_in_progress",
		count: 48,
	},
	{
		fromStatus: "Issue_in_progress",
		toStatus: "Issue_blocked",
		count: 12,
	},
	{
		fromStatus: "Issue_blocked",
		toStatus: "Issue_in_progress_retry",
		count: 8,
	},
	{
		fromStatus: "Issue_in_progress",
		toStatus: "Issue_done",
		count: 36,
	},
	{
		fromStatus: "Issue_in_progress_retry",
		toStatus: "Issue_done",
		count: 6,
	},
	{
		fromStatus: "PR_draft",
		toStatus: "PR_review",
		count: 42,
	},
	{
		fromStatus: "PR_review",
		toStatus: "PR_changes",
		count: 14,
	},
	{
		fromStatus: "PR_changes",
		toStatus: "PR_review_retry",
		count: 10,
	},
	{
		fromStatus: "PR_review_retry",
		toStatus: "PR_merge",
		count: 9,
	},
	{
		fromStatus: "PR_review",
		toStatus: "PR_merge",
		count: 28,
	},
	{
		fromStatus: "Deployment_build",
		toStatus: "Deployment_test",
		count: 30,
	},
	{
		fromStatus: "Deployment_test",
		toStatus: "Deployment_deploy",
		count: 26,
	},
	{
		fromStatus: "Deployment_deploy",
		toStatus: "Deployment_rollback",
		count: 4,
	},
	{
		fromStatus: "Deployment_rollback",
		toStatus: "Deployment_build_retry",
		count: 3,
	},
	{
		fromStatus: "Deployment_build_retry",
		toStatus: "Deployment_test_retry",
		count: 3,
	},
	{
		fromStatus: "Deployment_test_retry",
		toStatus: "Deployment_deploy_final",
		count: 3,
	},
];

// Minimal heatmap sample used for test/dev server mode
export const reviewHeatmapSample = {
	axes: {
		x: ["00:00", "06:00", "12:00", "18:00"],
		y: ["Mon", "Tue", "Wed", "Thu", "Fri"],
	},
	cells: [
		{ x: "00:00", y: "Mon", value: 0 },
		{ x: "12:00", y: "Wed", value: 5 },
	],
	legend: { unit: "hours", scale: "linear" },
	evidence: [],
};

export const hotspotHeatmapSample = {
	axes: {
		x: ["Mon", "Tue", "Wed", "Thu", "Fri"],
		y: ["auth", "billing", "search", "platform"],
	},
	cells: [
		{ x: "Mon", y: "auth", value: 3 },
		{ x: "Tue", y: "auth", value: 9 },
		{ x: "Wed", y: "auth", value: 6 },
		{ x: "Mon", y: "billing", value: 2 },
		{ x: "Tue", y: "billing", value: 5 },
		{ x: "Thu", y: "billing", value: 8 },
		{ x: "Wed", y: "search", value: 7 },
		{ x: "Fri", y: "search", value: 4 },
		{ x: "Thu", y: "platform", value: 1 },
		{ x: "Fri", y: "platform", value: 10 },
	],
	legend: { unit: "risk", scale: "linear" as const },
	evidence: [
		{
			path: "services/auth/session.ts",
			value: 18,
			ts: "2026-05-12T14:00:00Z",
		},
		{
			repo_id: "web-platform",
			repo_name: "web-platform",
			number: 412,
			value: 11,
			ts: "2026-05-11T09:30:00Z",
		},
		{
			commit_hash: "8f3a1c2d9b4e5f6a7b8c9d0e1f2a3b4c5d6e7f80",
			value: 6,
			ts: "2026-05-10T18:45:00Z",
		},
		{
			work_item_id: "MER-2087",
			title: "Flaky auth refresh",
			value: 4,
			ts: "2026-05-09T11:00:00Z",
		},
	],
};

export const churnHotspotContributors = [
	{
		id: "services/auth/session.ts",
		label: "Auth session",
		value: 320,
		delta_pct: 18,
		evidence_link: "/api/v1/explain?metric=churn&file=auth-session",
	},
	{
		id: "billing/invoices.ts",
		label: "Billing invoices",
		value: 240,
		delta_pct: 9,
		evidence_link: "/api/v1/explain?metric=churn&file=billing-invoices",
	},
	{
		id: "search/index.ts",
		label: "Search index",
		value: 180,
		delta_pct: -4,
		evidence_link: "/api/v1/explain?metric=churn&file=search-index",
	},
];

export const sankeyInvestmentNodes = [
	{ name: "Platform modernization", group: "initiative" },
	{ name: "Growth experiments", group: "initiative" },
	{ name: "Reliability hardening", group: "initiative" },
	{ name: "Auth refresh", group: "project" },
	{ name: "Billing revamp", group: "project" },
	{ name: "Onboarding revamp", group: "project" },
	{ name: "Search relevance", group: "project" },
	{ name: "Incident automation", group: "project" },
	{ name: "Observability uplift", group: "project" },
	{ name: "Feature", group: "issue_type" },
	{ name: "Bug", group: "issue_type" },
	{ name: "Chore", group: "issue_type" },
	{ name: "Task", group: "issue_type" },
	{ name: "Incident", group: "issue_type" },
	{ name: "Feature issues", group: "work_item" },
	{ name: "Feature PRs", group: "work_item" },
	{ name: "Bug issues", group: "work_item" },
	{ name: "Bug PRs", group: "work_item" },
	{ name: "Chore issues", group: "work_item" },
	{ name: "Chore PRs", group: "work_item" },
	{ name: "Task issues", group: "work_item" },
	{ name: "Task PRs", group: "work_item" },
	{ name: "Incident issues", group: "work_item" },
	{ name: "Incident PRs", group: "work_item" },
];

export const sankeyInvestmentLinks = [
	{ source: "Platform modernization", target: "Auth refresh", value: 30 },
	{ source: "Platform modernization", target: "Billing revamp", value: 20 },
	{ source: "Growth experiments", target: "Onboarding revamp", value: 28 },
	{ source: "Growth experiments", target: "Search relevance", value: 12 },
	{ source: "Reliability hardening", target: "Incident automation", value: 18 },
	{
		source: "Reliability hardening",
		target: "Observability uplift",
		value: 22,
	},
	{ source: "Auth refresh", target: "Feature", value: 18 },
	{ source: "Auth refresh", target: "Bug", value: 12 },
	{ source: "Billing revamp", target: "Feature", value: 12 },
	{ source: "Billing revamp", target: "Chore", value: 8 },
	{ source: "Onboarding revamp", target: "Feature", value: 20 },
	{ source: "Onboarding revamp", target: "Task", value: 8 },
	{ source: "Search relevance", target: "Feature", value: 7 },
	{ source: "Search relevance", target: "Bug", value: 5 },
	{ source: "Incident automation", target: "Incident", value: 10 },
	{ source: "Incident automation", target: "Task", value: 8 },
	{ source: "Observability uplift", target: "Chore", value: 12 },
	{ source: "Observability uplift", target: "Bug", value: 10 },
	{ source: "Feature", target: "Feature issues", value: 22 },
	{ source: "Feature", target: "Feature PRs", value: 35 },
	{ source: "Bug", target: "Bug issues", value: 10 },
	{ source: "Bug", target: "Bug PRs", value: 17 },
	{ source: "Chore", target: "Chore issues", value: 6 },
	{ source: "Chore", target: "Chore PRs", value: 14 },
	{ source: "Task", target: "Task issues", value: 8 },
	{ source: "Task", target: "Task PRs", value: 8 },
	{ source: "Incident", target: "Incident issues", value: 4 },
	{ source: "Incident", target: "Incident PRs", value: 6 },
];

export const sankeyExpenseNodes = [
	{ name: "Planned work", group: "expense" },
	{ name: "Unplanned work", group: "expense" },
	{ name: "Rework", group: "expense" },
	{ name: "Abandonment / rewrite", group: "expense" },
];

export const sankeyExpenseLinks = [
	{ source: "Planned work", target: "Unplanned work", value: 42 },
	{ source: "Unplanned work", target: "Rework", value: 19 },
	{ source: "Rework", target: "Abandonment / rewrite", value: 7 },
];

export const sankeyHotspotNodes = [
	{ name: "web-app", group: "repo" },
	{ name: "core-api", group: "repo" },
	{ name: "auth", group: "module" },
	{ name: "search", group: "module" },
	{ name: "billing", group: "module" },
	{ name: "infra", group: "module" },
	{ name: "src/auth", group: "directory" },
	{ name: "src/search", group: "directory" },
	{ name: "src/billing", group: "directory" },
	{ name: "infra/pipeline", group: "directory" },
	{ name: "token.ts", group: "file" },
	{ name: "session.ts", group: "file" },
	{ name: "ranking.ts", group: "file" },
	{ name: "query.ts", group: "file" },
	{ name: "billing.ts", group: "file" },
	{ name: "invoice.ts", group: "file" },
	{ name: "deploy.yml", group: "file" },
	{ name: "rollback.yml", group: "file" },
	{ name: "feature", group: "change_type" },
	{ name: "fix", group: "change_type" },
	{ name: "refactor", group: "change_type" },
];

export const sankeyHotspotLinks = [
	{ source: "web-app", target: "auth", value: 18 },
	{ source: "web-app", target: "search", value: 12 },
	{ source: "core-api", target: "billing", value: 16 },
	{ source: "core-api", target: "infra", value: 10 },
	{ source: "auth", target: "src/auth", value: 18 },
	{ source: "search", target: "src/search", value: 12 },
	{ source: "billing", target: "src/billing", value: 16 },
	{ source: "infra", target: "infra/pipeline", value: 10 },
	{ source: "src/auth", target: "token.ts", value: 10 },
	{ source: "src/auth", target: "session.ts", value: 8 },
	{ source: "src/search", target: "ranking.ts", value: 7 },
	{ source: "src/search", target: "query.ts", value: 5 },
	{ source: "src/billing", target: "billing.ts", value: 10 },
	{ source: "src/billing", target: "invoice.ts", value: 6 },
	{ source: "infra/pipeline", target: "deploy.yml", value: 6 },
	{ source: "infra/pipeline", target: "rollback.yml", value: 4 },
	{ source: "token.ts", target: "feature", value: 6 },
	{ source: "token.ts", target: "fix", value: 3 },
	{ source: "token.ts", target: "refactor", value: 1 },
	{ source: "session.ts", target: "feature", value: 3 },
	{ source: "session.ts", target: "fix", value: 3 },
	{ source: "session.ts", target: "refactor", value: 2 },
	{ source: "ranking.ts", target: "feature", value: 4 },
	{ source: "ranking.ts", target: "fix", value: 2 },
	{ source: "ranking.ts", target: "refactor", value: 1 },
	{ source: "query.ts", target: "feature", value: 2 },
	{ source: "query.ts", target: "fix", value: 2 },
	{ source: "query.ts", target: "refactor", value: 1 },
	{ source: "billing.ts", target: "feature", value: 4 },
	{ source: "billing.ts", target: "fix", value: 4 },
	{ source: "billing.ts", target: "refactor", value: 2 },
	{ source: "invoice.ts", target: "feature", value: 2 },
	{ source: "invoice.ts", target: "fix", value: 3 },
	{ source: "invoice.ts", target: "refactor", value: 1 },
	{ source: "deploy.yml", target: "feature", value: 2 },
	{ source: "deploy.yml", target: "fix", value: 2 },
	{ source: "deploy.yml", target: "refactor", value: 2 },
	{ source: "rollback.yml", target: "fix", value: 3 },
	{ source: "rollback.yml", target: "refactor", value: 1 },
];

/**
 * 12 teams exchanging review load. Includes asymmetric pairs to demonstrate
 * directional encoding. Designed to trigger the "Other" bucket when topN=8.
 *
 * Shape:
 * - 12 distinct teams (Growth, Mobile dominate; Operations, Security fall
 *   outside top-7 and aggregate into "Other").
 * - Strong bilateral: Growth <-> Mobile (60/60 = 120 bilateral) dwarfs the
 *   next strongest pair (Platform <-> Core = 44).
 * - Strongly asymmetric: Platform -> Core = 40 vs Core -> Platform = 4;
 *   Infra -> Ops = 35 vs Ops -> Infra = 6.
 * - No self-links.
 */
export const sampleChordTeamReviewLoad: ChordRecord[] = [
	{
		source: "Growth",
		target: "Mobile",
		value: 60,
		metadata: { team: "Growth", period: "2025-W08" },
	},
	{
		source: "Mobile",
		target: "Growth",
		value: 60,
		metadata: { team: "Mobile", period: "2025-W08" },
	},
	{
		source: "Platform",
		target: "Core",
		value: 40,
		metadata: { team: "Platform", period: "2025-W08" },
	},
	{
		source: "Core",
		target: "Platform",
		value: 4,
		metadata: { team: "Core", period: "2025-W08" },
	},
	{
		source: "Infra",
		target: "Ops",
		value: 35,
		metadata: { team: "Infra", period: "2025-W08" },
	},
	{
		source: "Ops",
		target: "Infra",
		value: 6,
		metadata: { team: "Ops", period: "2025-W08" },
	},
	{
		source: "Data",
		target: "Docs",
		value: 15,
		metadata: { team: "Data", period: "2025-W08" },
	},
	{
		source: "Docs",
		target: "Data",
		value: 3,
		metadata: { team: "Docs", period: "2025-W08" },
	},
	{
		source: "Reliability",
		target: "Core",
		value: 12,
		metadata: { team: "Reliability", period: "2025-W08" },
	},
	{
		source: "Core",
		target: "Reliability",
		value: 4,
		metadata: { team: "Core", period: "2025-W08" },
	},
	{
		source: "Research",
		target: "Data",
		value: 8,
		metadata: { team: "Research", period: "2025-W08" },
	},
	{
		source: "Data",
		target: "Research",
		value: 2,
		metadata: { team: "Data", period: "2025-W08" },
	},
	{
		source: "Operations",
		target: "Ops",
		value: 6,
		metadata: { team: "Operations", period: "2025-W08" },
	},
	{
		source: "Security",
		target: "Platform",
		value: 5,
		metadata: { team: "Security", period: "2025-W08" },
	},
	{
		source: "Security",
		target: "Infra",
		value: 4,
		metadata: { team: "Security", period: "2025-W08" },
	},
];

/**
 * 6 repos with cross-service work transfer. Small enough to NOT trigger "Other"
 * at default topN=8. Includes one strongly bilateral pair.
 *
 * Shape:
 * - 6 distinct repos (web-app, core-api, auth-service, billing-service, search-service,
 *   mobile-app).
 * - No self-links: demonstrates clean directional exchange.
 * - Strongest bilateral: web-app <-> core-api (25 + 20 = 45).
 * - Mix of strong and weak edges.
 */
export const sampleChordRepoTransfer: ChordRecord[] = [
	{
		source: "web-app",
		target: "core-api",
		value: 25,
		metadata: { repo: "web-app", period: "2025-W08" },
	},
	{
		source: "core-api",
		target: "web-app",
		value: 20,
		metadata: { repo: "core-api", period: "2025-W08" },
	},
	{
		source: "core-api",
		target: "auth-service",
		value: 18,
		metadata: { repo: "core-api", period: "2025-W08" },
	},
	{
		source: "auth-service",
		target: "core-api",
		value: 6,
		metadata: { repo: "auth-service", period: "2025-W08" },
	},
	{
		source: "core-api",
		target: "billing-service",
		value: 14,
		metadata: { repo: "core-api", period: "2025-W08" },
	},
	{
		source: "billing-service",
		target: "core-api",
		value: 10,
		metadata: { repo: "billing-service", period: "2025-W08" },
	},
	{
		source: "mobile-app",
		target: "core-api",
		value: 12,
		metadata: { repo: "mobile-app", period: "2025-W08" },
	},
	{
		source: "core-api",
		target: "mobile-app",
		value: 8,
		metadata: { repo: "core-api", period: "2025-W08" },
	},
	{
		source: "search-service",
		target: "core-api",
		value: 9,
		metadata: { repo: "search-service", period: "2025-W08" },
	},
	{
		source: "core-api",
		target: "search-service",
		value: 5,
		metadata: { repo: "core-api", period: "2025-W08" },
	},
	{
		source: "web-app",
		target: "auth-service",
		value: 7,
		metadata: { repo: "web-app", period: "2025-W08" },
	},
	{
		source: "web-app",
		target: "mobile-app",
		value: 3,
		metadata: { repo: "web-app", period: "2025-W08" },
	},
	{
		source: "billing-service",
		target: "auth-service",
		value: 4,
		metadata: { repo: "billing-service", period: "2025-W08" },
	},
	{
		source: "mobile-app",
		target: "search-service",
		value: 2,
		metadata: { repo: "mobile-app", period: "2025-W08" },
	},
];

/**
 * 5 work-types with rework loops. Deliberately includes several self-links
 * (A -> A) to demonstrate the self-link toggle.
 *
 * Shape:
 * - 5 distinct work types: feature, bugfix, refactor, incident, investigation.
 * - 4 self-links (bugfix, refactor, investigation, incident) to demo rework
 *   detection.
 * - 6 cross-type flows that express how feature work leaks into quality and
 *   maintenance buckets, and how investigations seed features.
 */
export const sampleChordWorkTypeRework: ChordRecord[] = [
	{
		source: "bugfix",
		target: "bugfix",
		value: 20,
		metadata: { workType: "bugfix", period: "2025-W08" },
	},
	{
		source: "refactor",
		target: "refactor",
		value: 15,
		metadata: { workType: "refactor", period: "2025-W08" },
	},
	{
		source: "investigation",
		target: "investigation",
		value: 10,
		metadata: { workType: "investigation", period: "2025-W08" },
	},
	{
		source: "incident",
		target: "incident",
		value: 8,
		metadata: { workType: "incident", period: "2025-W08" },
	},
	{
		source: "feature",
		target: "bugfix",
		value: 18,
		metadata: { workType: "feature", period: "2025-W08" },
	},
	{
		source: "feature",
		target: "refactor",
		value: 12,
		metadata: { workType: "feature", period: "2025-W08" },
	},
	{
		source: "incident",
		target: "bugfix",
		value: 14,
		metadata: { workType: "incident", period: "2025-W08" },
	},
	{
		source: "investigation",
		target: "feature",
		value: 6,
		metadata: { workType: "investigation", period: "2025-W08" },
	},
	{
		source: "bugfix",
		target: "refactor",
		value: 9,
		metadata: { workType: "bugfix", period: "2025-W08" },
	},
	{
		source: "refactor",
		target: "feature",
		value: 5,
		metadata: { workType: "refactor", period: "2025-W08" },
	},
];
