import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import {
  decodeSecurityFilter,
  defaultSecurityFilter,
  applyLockedRepoId,
} from "@/lib/filters/security";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { SecurityAlertQueue } from "@/components/security/SecurityAlertQueue";

type RepoSecurityPageProps = {
  params: Promise<{ repoId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function RepoSecurityPage({ params, searchParams }: RepoSecurityPageProps) {
  const { repoId } = await params;
  const queryParams = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(queryParams.f) ? queryParams.f[0] : queryParams.f;

  const baseFilter = encodedFilter ? decodeSecurityFilter(encodedFilter) : defaultSecurityFilter();

  const lockedFilter = applyLockedRepoId(baseFilter, repoId);

  const navFilters = defaultMetricFilter;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={navFilters} active="security" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header>
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
              Security / Repo
            </p>
            <h1 className="mt-2 font-(--font-display) text-3xl">{repoId}</h1>
            <p className="mt-2 text-sm text-(--ink-muted)">
              Security alerts scoped to this repository.
            </p>
          </header>

          <SecurityAlertQueue filter={lockedFilter} lockedRepoId={repoId} />
        </main>
      </div>
    </div>
  );
}
