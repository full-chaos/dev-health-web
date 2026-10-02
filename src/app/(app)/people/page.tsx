import { PeopleSearch } from "@/components/people/PeopleSearch";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter } from "@/lib/filters/encode";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

type PeoplePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
    const health = await checkApiHealth();

    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : defaultMetricFilter;
    const query = Array.isArray(params.q) ? params.q[0] : params.q;

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader title="People" subtitle="Individual metrics for a single-person view.">
                <p className="text-sm text-(--ink-muted)">Select an individual to investigate.</p>
            </PageHeader>

            {!health.ok && (
                <Notice variant="warn" live={false}>
                    Data service unavailable. Search results may be delayed until the API is back.
                </Notice>
            )}
            <ScopeBar view="people" />
            <PeopleSearch query={query} filters={filters} />
        </div>
    );
}
