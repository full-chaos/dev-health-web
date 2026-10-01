import { PageHeader } from "@/components/shell/PageHeader";
import {
    decodeSecurityFilter,
    defaultSecurityFilter,
    encodeSecurityFilter,
} from "@/lib/filters/security";
import { SecurityDashboard } from "@/components/security/SecurityDashboard";
import { SecurityAlertQueue } from "@/components/security/SecurityAlertQueue";
import { SecurityFilterBarWrapper } from "@/components/security/SecurityFilterBarWrapper";

type SecurityPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SecurityPage({ searchParams }: SecurityPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;

    const filter = encodedFilter ? decodeSecurityFilter(encodedFilter) : defaultSecurityFilter();

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8">
            <PageHeader
                title="Security Alerts"
                subtitle="Org-wide vulnerability posture — Dependabot, code scanning, and more."
            />

            <SecurityFilterBarWrapper
                encodedFilter={encodedFilter ?? encodeSecurityFilter(filter)}
            />
            <SecurityDashboard filter={filter} />
            <SecurityAlertQueue filter={filter} />
        </div>
    );
}
