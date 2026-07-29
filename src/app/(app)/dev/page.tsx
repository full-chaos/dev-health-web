import { AskDevWorkspace } from "@/components/ask-dev/AskDevWorkspace";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { DataState } from "@/components/ui/DataState";
import { getCurrentOrg, getOrgEntitlements } from "@/lib/admin/server";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { filterFromQueryParams } from "@/lib/filters/encode";

type AskDevPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AskDevPage({ searchParams }: AskDevPageProps) {
    const params = (await searchParams) ?? {};
    const filters = filterFromQueryParams(params);
    const role = Array.isArray(params.role) ? params.role[0] : params.role;
    const org = await fetchOrNull(getCurrentOrg(), "ask-dev/current-org");
    const entitlements = org?.data?.id
        ? await fetchOrNull(getOrgEntitlements(org.data.id), "ask-dev/entitlements")
        : null;
    const enabled =
        entitlements?.data?.is_valid === true && entitlements.data.features.ask_dev === true;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="ask-dev" role={role} />
                <main className="flex min-w-0 flex-1 flex-col gap-4">
                    {enabled ? (
                        <>
                            <GlobalContextBar filters={filters} />
                            <AskDevWorkspace />
                        </>
                    ) : (
                        <DataState
                            variant="source-unsupported"
                            title="Ask Dev is not available for this organization"
                            description="Ask Dev appears here only when it is explicitly enabled for this organization and its license."
                            className="w-full rounded-(--radius-lg) border border-(--border) bg-(--surface) p-8"
                        />
                    )}
                </main>
            </div>
        </div>
    );
}
