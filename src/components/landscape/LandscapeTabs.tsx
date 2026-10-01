import type { ReactNode } from "react";

import type { HotspotRow } from "@/components/complexity/ComplexityDashboard";
import { DataState } from "@/components/ui/DataState";
import { formatNumber } from "@/lib/formatters";
import type { BusFactor } from "@/lib/graphql/types";
import type { QuadrantResponse } from "@/lib/types";

// ── Shared table shell (server-rendered) ────────────────────────────────────

export function LandscapeTable({
    columns,
    rows,
    testId,
    empty,
}: {
    columns: { label: string; align?: "left" | "right" }[];
    rows: ReactNode[];
    testId: string;
    empty: { title: string; description: string };
}) {
    if (rows.length === 0) {
        return (
            <DataState
                variant="detector-enabled-no-findings"
                title={empty.title}
                description={empty.description}
            />
        );
    }
    return (
        <div className="overflow-hidden rounded-(--radius-sm) border border-(--card-stroke) bg-(--card-90) shadow-sm">
            <table className="w-full text-sm" data-testid={testId}>
                <thead className="bg-(--card-60) text-label-caps font-semibold uppercase text-(--ink-muted)">
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.label}
                                className={`px-5 py-3 ${col.align === "right" ? "text-right" : "text-left"}`}
                            >
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        </div>
    );
}

export function TabPanel({
    title,
    description,
    children,
    testId,
}: {
    title: string;
    description: string;
    children: ReactNode;
    testId: string;
}) {
    return (
        <section
            className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm"
            data-testid={testId}
        >
            <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                <p className="mt-1 text-sm text-(--ink-muted)">{description}</p>
            </div>
            {children}
        </section>
    );
}

// ── Teams tab — derived from the two quadrant point sets ────────────────────

export function TeamsView({
    cycleData,
    churnData,
}: {
    cycleData: QuadrantResponse | null;
    churnData: QuadrantResponse | null;
}) {
    const churnById = new Map((churnData?.points ?? []).map((p) => [p.entity_id, p.x]));
    const rows = (cycleData?.points ?? [])
        .map((p) => ({
            id: p.entity_id,
            label: p.entity_label,
            cycle: p.x,
            throughput: p.y,
            churn: churnById.get(p.entity_id),
        }))
        .sort((a, b) => b.throughput - a.throughput);

    return (
        <TabPanel
            title="Teams"
            description="Delivery pace and pressure per team — throughput against cycle time and change volume."
            testId="landscape-teams"
        >
            <LandscapeTable
                testId="teams-table"
                empty={{
                    title: "No team data",
                    description:
                        "Team operating-mode data is not available for this scope and window.",
                }}
                columns={[
                    { label: "Team" },
                    { label: "Throughput (items)", align: "right" },
                    { label: "Cycle time (days)", align: "right" },
                    { label: "Churn (loc)", align: "right" },
                ]}
                rows={rows.map((r) => (
                    <tr
                        key={r.id}
                        data-testid="teams-row"
                        className="border-t border-(--card-stroke)/60"
                    >
                        <td className="px-5 py-3 align-middle font-medium">{r.label}</td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {formatNumber(r.throughput, { maximumFractionDigits: 1 })}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {formatNumber(r.cycle, { maximumFractionDigits: 1 })}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {r.churn === undefined
                                ? "—"
                                : formatNumber(r.churn, { maximumFractionDigits: 0 })}
                        </td>
                    </tr>
                ))}
            />
        </TabPanel>
    );
}

// ── Repos tab — hotspots aggregated by repository ───────────────────────────

export function ReposView({ hotspots }: { hotspots: HotspotRow[] }) {
    const byRepo = new Map<
        string,
        { repoName: string; files: number; churn: number; riskSum: number }
    >();
    for (const row of hotspots) {
        const entry = byRepo.get(row.repoId) ?? {
            repoName: row.repoName,
            files: 0,
            churn: 0,
            riskSum: 0,
        };
        entry.files += 1;
        entry.churn += row.churnLoc30d;
        entry.riskSum += row.riskScore;
        byRepo.set(row.repoId, entry);
    }
    const rows = Array.from(byRepo.values())
        .map((r) => ({ ...r, avgRisk: r.files ? r.riskSum / r.files : 0 }))
        .sort((a, b) => b.churn - a.churn);

    return (
        <TabPanel
            title="Repos"
            description="Repository activity and risk — change volume and average hotspot risk across tracked files."
            testId="landscape-repos"
        >
            <LandscapeTable
                testId="repos-table"
                empty={{
                    title: "No repository data",
                    description:
                        "Repository hotspot data is not available for this scope and window.",
                }}
                columns={[
                    { label: "Repo" },
                    { label: "Hotspot files", align: "right" },
                    { label: "Churn LOC 30d", align: "right" },
                    { label: "Avg risk", align: "right" },
                ]}
                rows={rows.map((r) => (
                    <tr
                        key={r.repoName}
                        data-testid="repos-row"
                        className="border-t border-(--card-stroke)/60"
                    >
                        <td className="px-5 py-3 align-middle font-medium">{r.repoName}</td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {formatNumber(r.files)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {formatNumber(r.churn)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                            {formatNumber(r.avgRisk, { maximumFractionDigits: 3 })}
                        </td>
                    </tr>
                ))}
            />
        </TabPanel>
    );
}

// ── Ownership tab — bus factor per repository ───────────────────────────────

export function OwnershipView({ busFactor }: { busFactor: BusFactor | null }) {
    const rows = [...(busFactor?.repos ?? [])].sort((a, b) => a.value - b.value);

    return (
        <TabPanel
            title="Ownership risk"
            description="Bus factor per repository — how many maintainers carry each repo. Lower means more single-owner risk."
            testId="landscape-ownership"
        >
            <LandscapeTable
                testId="ownership-table"
                empty={{
                    title: "No ownership data",
                    description:
                        "Bus-factor data needs commit-author history for this scope and window.",
                }}
                columns={[
                    { label: "Repo" },
                    { label: "Bus factor", align: "right" },
                    { label: "Top maintainer" },
                    { label: "Share", align: "right" },
                ]}
                rows={rows.map((r) => {
                    const top = r.topMaintainers[0];
                    return (
                        <tr
                            key={r.repoId}
                            data-testid="ownership-row"
                            className="border-t border-(--card-stroke)/60"
                        >
                            <td className="px-5 py-3 align-middle font-medium">{r.repoName}</td>
                            <td className="px-5 py-3 text-right tabular-nums">
                                {formatNumber(r.value, { maximumFractionDigits: 1 })}
                            </td>
                            <td className="px-5 py-3 align-middle text-(--ink-muted)">
                                {top ? top.author : "—"}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">
                                {top ? `${Math.round(top.sharePercent)}%` : "—"}
                            </td>
                        </tr>
                    );
                })}
            />
        </TabPanel>
    );
}

// ── Hotspots tab — file-level risk ──────────────────────────────────────────

export function HotspotsView({ hotspots }: { hotspots: HotspotRow[] }) {
    const rows = [...hotspots].sort((a, b) => b.riskScore - a.riskScore).slice(0, 25);

    return (
        <TabPanel
            title="Hotspots"
            description="Files carrying the most risk — churn × complexity × ownership concentration."
            testId="landscape-hotspots"
        >
            <LandscapeTable
                testId="hotspots-table"
                empty={{
                    title: "No hotspot files",
                    description: "No files crossed the hotspot risk threshold in this window.",
                }}
                columns={[
                    { label: "File" },
                    { label: "Repo" },
                    { label: "Risk score", align: "right" },
                    { label: "Churn LOC 30d", align: "right" },
                ]}
                rows={rows.map((r) => {
                    const fileName = r.filePath.split("/").pop() ?? r.filePath;
                    return (
                        <tr
                            key={`${r.repoId}-${r.filePath}`}
                            data-testid="hotspots-row"
                            className="border-t border-(--card-stroke)/60"
                        >
                            <td
                                className="px-5 py-3 align-middle font-mono text-[0.82em]"
                                title={r.filePath}
                            >
                                {fileName}
                            </td>
                            <td className="px-5 py-3 align-middle text-(--ink-muted)">
                                {r.repoName}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">
                                {formatNumber(r.riskScore, { maximumFractionDigits: 3 })}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">
                                {formatNumber(r.churnLoc30d)}
                            </td>
                        </tr>
                    );
                })}
            />
        </TabPanel>
    );
}
