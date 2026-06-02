"use client";

import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { AITabNav } from "./AITabNav";

/**
 * Shared chrome for the unified AI Workflows area. Rendered once via
 * `src/app/(app)/ai/layout.tsx` so all AI tabs share a single sidebar entry
 * (`active="ai-workflows"`) plus one tab strip.
 *
 * Filters are read client-side from the URL because Next.js layouts do not
 * receive `searchParams`. This mirrors the `f`/`role` query convention used by
 * the per-page server components so deep links keep working.
 */
export function AIWorkspaceChrome({ children }: { children: ReactNode }) {
	const searchParams = useSearchParams();

	const { filters, role } = useMemo(() => {
		const encoded = searchParams.get("f");
		const roleParam = searchParams.get("role") ?? undefined;

		if (encoded) {
			return { filters: decodeFilter(encoded), role: roleParam };
		}

		const params: Record<string, string> = {};
		searchParams.forEach((value, key) => {
			params[key] = value;
		});
		return { filters: filterFromQueryParams(params), role: roleParam };
	}, [searchParams]);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
				<PrimaryNav filters={filters} active="ai-workflows" role={role} />
				<main className="flex min-w-0 flex-1 flex-col gap-8">
					<AITabNav filters={filters} role={role} />
					{children}
				</main>
			</div>
		</div>
	);
}
