import type { ReactNode } from "react";

import type { HotspotRow } from "@/components/complexity/ComplexityDashboard";
import { DataState } from "@/components/ui/DataState";
import type { BusFactor } from "@/lib/graphql/types";
import type { QuadrantResponse } from "@/lib/types";

import { HotspotsTable, OwnershipTable, ReposTable, TeamsTable } from "./LandscapeTables";

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
            {rows.length === 0 ? (
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No team data"
                    description="Team operating-mode data is not available for this scope and window."
                />
            ) : (
                <TeamsTable
                    rows={rows.map((r) => ({
                        id: r.id,
                        label: r.label,
                        throughput: r.throughput,
                        cycle: r.cycle,
                        churn: r.churn === undefined ? null : r.churn,
                    }))}
                />
            )}
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
            {rows.length === 0 ? (
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No repository data"
                    description="Repository hotspot data is not available for this scope and window."
                />
            ) : (
                <ReposTable
                    rows={rows.map((r) => ({
                        repoName: r.repoName,
                        files: r.files,
                        churn: r.churn,
                        avgRisk: r.avgRisk,
                    }))}
                />
            )}
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
            {rows.length === 0 ? (
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No ownership data"
                    description="Bus-factor data needs commit-author history for this scope and window."
                />
            ) : (
                <OwnershipTable
                    rows={rows.map((r) => {
                        const top = r.topMaintainers[0];
                        return {
                            repoId: r.repoId,
                            repoName: r.repoName,
                            value: r.value,
                            topAuthor: top ? top.author : null,
                            topSharePercent: top ? top.sharePercent : null,
                        };
                    })}
                />
            )}
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
            {rows.length === 0 ? (
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No hotspot files"
                    description="No files crossed the hotspot risk threshold in this window."
                />
            ) : (
                <HotspotsTable
                    rows={rows.map((r) => ({
                        key: `${r.repoId}-${r.filePath}`,
                        fileName: r.filePath.split("/").pop() ?? r.filePath,
                        filePath: r.filePath,
                        repoName: r.repoName,
                        riskScore: r.riskScore,
                        churnLoc30d: r.churnLoc30d,
                    }))}
                />
            )}
        </TabPanel>
    );
}
