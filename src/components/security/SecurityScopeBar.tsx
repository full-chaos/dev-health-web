"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ScopeBarFrame, type ScopeBarRepoOption } from "@/components/shell/ScopeBarFrame";
import { useSecurityOverview } from "@/lib/graphql/hooks/useSecurity";
import {
    decodeSecurityFilter,
    defaultSecurityFilter,
    encodeSecurityFilter,
    type SecurityFilter,
} from "@/lib/filters/security";

import { SecurityFilterBarWrapper } from "./SecurityFilterBarWrapper";

/** `topRepos` of the overview query returns at most this many repositories (query-api `topReposLimit`). */
export const TOP_REPOS_LIMIT = 10;

/**
 * The scope bar of /security: organization and repository in the card row, and
 * the page's own Severity / State / Source rows in the same card. The page keeps
 * one `f` (the Security filter, `encodeSecurityFilter`): there is no team and no
 * window, because the Security queries do not take them.
 *
 * The repository menu lists the repositories that have alerts (the overview's
 * `topRepos`, read without the repository filter so selecting one does not
 * shrink the menu). It is not the full repository list.
 */
export function SecurityScopeBar({ encodedFilter }: { encodedFilter?: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const filter = encodedFilter
        ? decodeSecurityFilter(encodedFilter)
        : decodeSecurityFilter(searchParams.get("f") ?? undefined);

    const replaceFilter = useCallback(
        (next: SecurityFilter) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("f", encodeSecurityFilter(next));
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    const optionsFilter = useMemo(() => ({ ...filter, repoIds: undefined }), [filter]);
    const { data } = useSecurityOverview(optionsFilter);
    const options: ScopeBarRepoOption[] = useMemo(
        () =>
            (data?.securityOverview?.topRepos ?? []).map((repo) => ({
                id: repo.repoId,
                label: repo.repoName,
            })),
        [data],
    );

    return (
        <ScopeBarFrame
            view="security"
            repos={{
                options,
                selected: filter.repoIds ?? [],
                onChange: (ids) => {
                    const next = { ...filter };
                    if (ids.length > 0) next.repoIds = ids;
                    else delete next.repoIds;
                    replaceFilter(next);
                },
            }}
            onReset={() => replaceFilter(defaultSecurityFilter())}
        >
            <p className="text-xs text-(--text-muted)" data-testid="security-repo-caption">
                Repositories with alerts (up to {TOP_REPOS_LIMIT}). Severity, state and source apply
                to the whole page.
            </p>
            <SecurityFilterBarWrapper embedded encodedFilter={encodedFilter} />
        </ScopeBarFrame>
    );
}
