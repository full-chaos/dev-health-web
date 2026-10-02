import Link from "next/link";
import { Plus } from "lucide-react";

import { ReportsTable } from "@/components/reports/ReportsTable";
import { buttonClassName } from "@/components/shared/Button";
import { PageHeader } from "@/components/shell/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { RetryButton } from "@/components/ui/RetryButton";
import { Section } from "@/components/ui/Section";
import { getServerEnv } from "@/lib/config";
import { CTA_LABELS } from "@/lib/design/cta";
import { fetchSavedReportsChecked } from "@/lib/reports/fetchers";

// The page reads no query param: the saved reports do not depend on the scope
// (`f` and `role` fed the page-level navigation and the global context bar
// only). The shell keeps them in the navigation links.
export default async function ReportsPage() {
    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
    const reportsData = await fetchSavedReportsChecked(
        "default-org",
        undefined,
        undefined,
        isTestMode,
    );
    const reports = reportsData.items;

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Report Center"
                subtitle="Create, manage, and schedule AI-generated reports."
                actions={
                    <Link href="/reports/new" className={buttonClassName("primary", "md")}>
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        {CTA_LABELS.newReport}
                    </Link>
                }
            />

            <Section title="Saved reports">
                {reportsData.error ? (
                    <DataState
                        variant="error"
                        title="Saved reports could not be loaded"
                        message="The request failed. Retry, or check again in a moment."
                        action={<RetryButton />}
                    />
                ) : reports.length === 0 ? (
                    <DataState
                        variant="no-findings"
                        title="No saved reports yet"
                        description="Create your first report to get started."
                        action={
                            <Link
                                href="/reports/new"
                                className={buttonClassName("secondary", "md")}
                            >
                                {CTA_LABELS.createReport}
                            </Link>
                        }
                    />
                ) : (
                    <ReportsTable reports={reports} />
                )}
            </Section>
        </div>
    );
}
