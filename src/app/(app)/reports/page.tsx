import Link from "next/link";

import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { StatusBadge } from "@/components/reports/StatusBadge";
import { CTA_LABELS } from "@/lib/design/cta";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchSavedReports } from "@/lib/reports/fetchers";
import { getServerEnv } from "@/lib/config";

type ReportsPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
    const reportsData = await fetchSavedReports("default-org", undefined, undefined, isTestMode);
    const reports = reportsData.items;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="reports" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Reports
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">Report Center</h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Create, manage, and schedule AI-generated reports.
                            </p>
                        </div>
                        <Link
                            href="/reports/new"
                            className="rounded-full bg-(--accent) px-4 py-2 text-xs uppercase tracking-[0.2em] text-white hover:bg-(--accent-hover) transition-colors"
                        >
                            {CTA_LABELS.newReport}
                        </Link>
                    </header>

                    <GlobalContextBar filters={filters} />

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
                                                <h3 className="font-(--font-display) text-lg font-medium group-hover:text-(--accent) transition-colors">
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
                                                    ? new Date(
                                                          report.lastRunAt,
                                                      ).toLocaleDateString()
                                                    : "Never"}
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>
                </main>
            </div>
        </div>
    );
}
