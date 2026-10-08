import { PageHeader } from "@/components/shell/PageHeader";
import { SecurityAlertQueue } from "@/components/security/SecurityAlertQueue";
import { SecurityRepoScopeBar } from "@/components/security/SecurityRepoScopeBar";
import { requireSession } from "@/lib/auth";
import {
    decodeSecurityFilter,
    defaultSecurityFilter,
    applyLockedRepoId,
} from "@/lib/filters/security";
import { graphqlFetch } from "@/lib/graphql/server";
import { SECURITY_ALERTS_QUERY } from "@/lib/graphql/queries";

type RepoSecurityPageProps = {
    params: Promise<{ repoId: string }>;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * The repository name for the page title, read from one alert of the
 * repository (the alert rows carry `repoName`), whatever its state. Any failure
 * gives `undefined`: the title falls back to the repository id and is never
 * blank.
 */
async function fetchRepoName(repoId: string): Promise<string | undefined> {
    try {
        const session = await requireSession();
        const orgId = session.user?.org_id;
        if (!orgId) return undefined;
        const data = await graphqlFetch<{
            securityAlerts?: {
                edges?: Array<{ node?: { repoId?: string; repoName?: string | null } }>;
            };
        }>(
            SECURITY_ALERTS_QUERY,
            {
                orgId,
                filters: { repoIds: [repoId], openOnly: false },
                pagination: { first: 1, after: null },
            },
            { orgId },
        );
        const node = data?.securityAlerts?.edges?.[0]?.node;
        return node?.repoId === repoId ? node.repoName?.trim() || undefined : undefined;
    } catch {
        return undefined;
    }
}

export default async function RepoSecurityPage({ params, searchParams }: RepoSecurityPageProps) {
    const { repoId } = await params;
    const queryParams = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(queryParams.f) ? queryParams.f[0] : queryParams.f;

    const baseFilter = encodedFilter
        ? decodeSecurityFilter(encodedFilter)
        : defaultSecurityFilter();

    const lockedFilter = applyLockedRepoId(baseFilter, repoId);
    const name = await fetchRepoName(repoId);

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8">
            <PageHeader
                title={name ?? "Repository"}
                subtitle="Security alerts scoped to this repository."
                back={{ href: "/security", area: "Security" }}
            />
            <SecurityRepoScopeBar repoId={repoId} name={name} />

            <SecurityAlertQueue filter={lockedFilter} lockedRepoId={repoId} />
        </div>
    );
}
