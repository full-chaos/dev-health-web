import { PageHeader } from "@/components/shell/PageHeader";
import {
    decodeSecurityFilter,
    defaultSecurityFilter,
    applyLockedRepoId,
} from "@/lib/filters/security";
import { SecurityAlertQueue } from "@/components/security/SecurityAlertQueue";

type RepoSecurityPageProps = {
    params: Promise<{ repoId: string }>;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function RepoSecurityPage({ params, searchParams }: RepoSecurityPageProps) {
    const { repoId } = await params;
    const queryParams = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(queryParams.f) ? queryParams.f[0] : queryParams.f;

    const baseFilter = encodedFilter
        ? decodeSecurityFilter(encodedFilter)
        : defaultSecurityFilter();

    const lockedFilter = applyLockedRepoId(baseFilter, repoId);

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8">
            <PageHeader
                title={repoId}
                subtitle="Security alerts scoped to this repository."
                back={{ href: "/security", area: "Security" }}
            />

            <SecurityAlertQueue filter={lockedFilter} lockedRepoId={repoId} />
        </div>
    );
}
