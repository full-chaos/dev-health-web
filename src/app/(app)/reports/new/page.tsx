"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { CTA_LABELS } from "@/lib/design/cta";
import { createSavedReport } from "@/lib/reports/fetchers";
import type { CreateSavedReportInput } from "@/lib/reports/types";

const SCHEDULE_CRON_MAP: Record<string, string | undefined> = {
    none: undefined,
    weekly: "0 9 * * 1",
    monthly: "0 9 1 * *",
};

const AVAILABLE_METRICS = [
    "Deployment Frequency",
    "Lead Time",
    "Change Failure Rate",
    "Time to Restore",
    "Test Coverage",
    "CI Success Rate",
];

export default function NewReportPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [scope, setScope] = useState("org");
    const [dateRange, setDateRange] = useState("last_7_days");
    const [schedule, setSchedule] = useState("none");
    const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set(AVAILABLE_METRICS));

    const toggleMetric = (metric: string) => {
        setSelectedMetrics((prev) => {
            const next = new Set(prev);
            if (next.has(metric)) {
                next.delete(metric);
            } else {
                next.add(metric);
            }
            return next;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const input: CreateSavedReportInput = {
            name,
            description: description || undefined,
            scheduleCron: SCHEDULE_CRON_MAP[schedule],
            parameters: { scope, dateRange, metrics: Array.from(selectedMetrics) },
        };

        try {
            await createSavedReport("default-org", input);
            router.push("/reports");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create report");
            setIsSubmitting(false);
        }
    };

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Create Report"
                subtitle="Define a new AI-generated report."
                back={{ href: "/reports", area: "Reports" }}
            />

            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-6 md:p-8">
                <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
                    <div className="space-y-4">
                        <h2 className="font-(--font-display) text-xl">Basic Details</h2>

                        <div className="space-y-2">
                            <label htmlFor="name" className="block text-sm font-medium">
                                Report Name
                            </label>
                            <input
                                type="text"
                                id="name"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                placeholder="e.g., Weekly Engineering Health"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="description" className="block text-sm font-medium">
                                Description
                            </label>
                            <textarea
                                id="description"
                                rows={3}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                placeholder="What is this report for?"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h2 className="font-(--font-display) text-xl">Configuration</h2>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label htmlFor="scope" className="block text-sm font-medium">
                                    Scope
                                </label>
                                <select
                                    id="scope"
                                    value={scope}
                                    onChange={(e) => setScope(e.target.value)}
                                    className="w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                >
                                    <option value="org">Organization</option>
                                    <option value="team">Team</option>
                                    <option value="repo">Repository</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="dateRange" className="block text-sm font-medium">
                                    Date Range
                                </label>
                                <select
                                    id="dateRange"
                                    value={dateRange}
                                    onChange={(e) => setDateRange(e.target.value)}
                                    className="w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                >
                                    <option value="last_7_days">Last 7 Days</option>
                                    <option value="last_30_days">Last 30 Days</option>
                                    <option value="last_90_days">Last 90 Days</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium">Metrics to Include</label>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {AVAILABLE_METRICS.map((metric) => (
                                    <label
                                        key={metric}
                                        className="flex items-center gap-2 rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm cursor-pointer hover:border-(--accent) transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            className="rounded border-(--card-stroke) text-(--accent) focus:ring-(--accent)"
                                            checked={selectedMetrics.has(metric)}
                                            onChange={() => toggleMetric(metric)}
                                        />
                                        <span>{metric}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="schedule" className="block text-sm font-medium">
                                Schedule
                            </label>
                            <select
                                id="schedule"
                                value={schedule}
                                onChange={(e) => setSchedule(e.target.value)}
                                className="w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                            >
                                <option value="none">None (Manual only)</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                            {error}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-4 pt-4 border-t border-(--card-stroke)">
                        <Link
                            href="/reports"
                            className="rounded-full border border-(--card-stroke) px-6 py-2 text-sm font-medium hover:bg-(--card-70) transition-colors"
                        >
                            {CTA_LABELS.cancel}
                        </Link>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-full bg-(--accent) px-6 py-2 text-sm font-medium text-white hover:bg-(--accent-hover) transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? "Creating..." : CTA_LABELS.createReport}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
