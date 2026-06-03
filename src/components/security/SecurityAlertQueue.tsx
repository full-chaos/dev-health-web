"use client";

import { useSecurityAlerts } from "@/lib/graphql/hooks/useSecurity";
import type { SecurityFilter } from "@/lib/filters/security";
import { SecurityAlertRow } from "./SecurityAlertRow";
import { DataState } from "@/components/ui/DataState";
import type { SecurityAlertRowData } from "./types";

interface SecurityAlertQueueProps {
	filter: SecurityFilter;
	lockedRepoId?: string;
}

export function SecurityAlertQueue({
	filter,
	lockedRepoId,
}: SecurityAlertQueueProps) {
	const { data, fetching, error, fetchMore, allEdges } =
		useSecurityAlerts(filter);

	if (error) {
		return (
			<DataState
				variant="error"
				title="Failed to load security alerts"
				message={error.message}
			/>
		);
	}

	const pageInfo = data?.securityAlerts?.pageInfo;
	const totalCount = data?.securityAlerts?.totalCount ?? 0;

	return (
		<div className="flex flex-col gap-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<p className="text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
						Alert Queue
					</p>
					{!fetching && totalCount > 0 && (
						<p className="mt-0.5 text-xs text-(--ink-muted)">
							{totalCount} total
						</p>
					)}
				</div>
				{lockedRepoId && (
					<span
						className="inline-flex items-center gap-1.5 rounded-full border border-(--card-stroke) bg-(--card-80) px-3 py-1 text-xs text-(--ink-muted)"
						data-testid="locked-repo-pill"
					>
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
							aria-hidden="true"
						>
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
							<path d="M7 11V7a5 5 0 0 1 10 0v4" />
						</svg>
						{lockedRepoId}
					</span>
				)}
			</div>

			{/* Table */}
			<div className="rounded-2xl border border-(--card-stroke) bg-card overflow-hidden">
				{fetching && allEdges.length === 0 ? (
					<div className="divide-y divide-(--card-stroke)">
						{Array.from({ length: 8 }).map((_, i) => (
							<div key={i} className="flex gap-3 px-3 py-3 animate-pulse">
								<div className="h-5 w-16 rounded bg-(--card-70)" />
								<div className="h-5 w-20 rounded bg-(--card-70)" />
								<div className="h-5 flex-1 rounded bg-(--card-70)" />
								<div className="h-5 w-24 rounded bg-(--card-70)" />
							</div>
						))}
					</div>
				) : allEdges.length === 0 ? (
					<div className="p-8">
						<DataState
							variant="detector-enabled-no-findings"
							title="No alerts match these filters"
							description="Try adjusting or clearing the active filters."
						/>
					</div>
				) : (
					<div className="divide-y divide-(--card-stroke)">
						{allEdges.map((edge) => (
							<SecurityAlertRow
								key={edge.cursor}
								alert={edge.node as SecurityAlertRowData}
							/>
						))}
					</div>
				)}
			</div>

			{/* Load more */}
			{pageInfo?.hasNextPage && pageInfo.endCursor && (
				<div className="flex justify-center pt-2">
					<button
						onClick={() => fetchMore(pageInfo.endCursor!)}
						disabled={fetching}
						className="rounded-full border border-(--card-stroke) px-6 py-2 text-xs uppercase tracking-[0.15em] transition hover:bg-(--card-80) disabled:opacity-50"
					>
						{fetching ? "Loading…" : "Load more"}
					</button>
				</div>
			)}
		</div>
	);
}
