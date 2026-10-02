import Link from "next/link";
import { Plus } from "lucide-react";

import { StatusBadge } from "@/components/reports/StatusBadge";
import { CTA_LABELS } from "@/lib/design/cta";
import { fetchSavedReports } from "@/lib/reports/fetchers";
import { getServerEnv } from "@/lib/config";
import { buttonClassName } from "@/components/shared/Button";
import { PageHeader } from "@/components/shell/PageHeader";

// The page reads no query param: the saved reports do not depend on the scope
// (`f` and `role` fed the page-level navigation and the global context bar
// only). The shell keeps them in the navigation links.
export default async function ReportsPage() {
    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
    const reportsData = await fetchSavedReports("default-org", undefined, undefined, isTestMode);
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

            <section className="flex flex-col gap-4">
                {reports.length === 0 ? (
                    <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-10 text-center">
                        <p className="text-(--ink-muted)">
                            No saved reports yet. Create your first report to get started.
                        </p>
                        <Link
                            href="/reports/new"
                            className="mt-4 inline-block rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em] hover:bg-(--card-70) transition-colors"
                        >
                            {CTA_LABELS.createReport}
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {reports.map((report) => (
                            <Link
                                key={report.id}
                                href={`/reports/${report.id}`}
                                className="group flex flex-col justify-between rounded-3xl border border-(--card-stroke) bg-(--card) p-5 hover:border-(--accent) transition-colors"
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-(--font-display) text-lg font-medium group-hover:text-(--accent-2) transition-colors">
                                            {report.name}
                                        </h3>
                                        <StatusBadge status={report.lastRunStatus} />
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-sm text-(--ink-muted)">
                                        {report.description}
                                    </p>
                                </div>
                                <div className="mt-6 flex items-center justify-between text-xs text-(--ink-muted)">
                                    <span className="uppercase tracking-wider">
                                        {report.scheduleId ? "Scheduled" : "Manual"}
                                    </span>
                                    <span>
                                        {report.lastRunAt
                                            ? new Date(report.lastRunAt).toLocaleDateString()
                                            : "Never"}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
