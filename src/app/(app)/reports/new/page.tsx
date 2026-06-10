"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { defaultMetricFilter } from "@/lib/filters/defaults";
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
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={defaultMetricFilter} active="reports" />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3">
                                <Link
                                    href="/reports"
                                    className="text-(--ink-muted) hover:text-foreground transition-colors"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="m15 18-6-6 6-6" />
                                    </svg>
                                </Link>
                                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                    New Report
                                </p>
                            </div>
                            <h1 className="mt-2 font-(--font-display) text-3xl">Create Report</h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Define a new AI-generated report.
                            </p>
                        </div>
                    </header>

                    <div className="rounded-3xl border border-(--border) bg-(--card) p-6 md:p-8">
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
                                        className="w-full rounded-xl border border-(--border) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                        placeholder="e.g., Weekly Engineering Health"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label
                                        htmlFor="description"
                                        className="block text-sm font-medium"
                                    >
                                        Description
                                    </label>
                                    <textarea
                                        id="description"
                                        rows={3}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="w-full rounded-xl border border-(--border) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                        placeholder="What is this report for?"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h2 className="font-(--font-display) text-xl">Configuration</h2>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <label
                                            htmlFor="scope"
                                            className="block text-sm font-medium"
                                        >
                                            Scope
                                        </label>
                                        <select
                                            id="scope"
                                            value={scope}
                                            onChange={(e) => setScope(e.target.value)}
                                            className="w-full rounded-xl border border-(--border) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                        >
                                            <option value="org">Organization</option>
                                            <option value="team">Team</option>
                                            <option value="repo">Repository</option>
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label
                                            htmlFor="dateRange"
                                            className="block text-sm font-medium"
                                        >
                                            Date Range
                                        </label>
                                        <select
                                            id="dateRange"
                                            value={dateRange}
                                            onChange={(e) => setDateRange(e.target.value)}
                                            className="w-full rounded-xl border border-(--border) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                        >
                                            <option value="last_7_days">Last 7 Days</option>
                                            <option value="last_30_days">Last 30 Days</option>
                                            <option value="last_90_days">Last 90 Days</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-medium">
                                        Metrics to Include
                                    </label>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {AVAILABLE_METRICS.map((metric) => (
                                            <label
                                                key={metric}
                                                className="flex items-center gap-2 rounded-xl border border-(--border) bg-(--card-70) px-4 py-2 text-sm cursor-pointer hover:border-(--accent) transition-colors"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-(--border) text-(--accent) focus:ring-(--accent)"
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
                                        className="w-full rounded-xl border border-(--border) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
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

                            <div className="flex items-center justify-end gap-4 pt-4 border-t border-(--border)">
                                <Link
                                    href="/reports"
                                    className="rounded-full border border-(--border) px-6 py-2 text-sm font-medium hover:bg-(--card-70) transition-colors"
                                >
                                    Cancel
                                </Link>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="rounded-full bg-(--accent) px-6 py-2 text-sm font-medium text-white hover:bg-(--accent-hover) transition-colors disabled:opacity-50"
                                >
                                    {isSubmitting ? "Creating..." : "Create Report"}
                                </button>
                            </div>
                        </form>
                    </div>
                </main>
            </div>
        </div>
    );
}
