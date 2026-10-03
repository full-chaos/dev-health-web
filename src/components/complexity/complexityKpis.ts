/**
 * Pure KPI helpers of the Complexity page. Not a client module, so the server page can call them
 * for the header evidence too; `ComplexityDashboard` re-exports them.
 */
import type { ComplexityPoint, HotspotRow } from "./ComplexityDashboard";

/** Group points by scope, returning the latest point per scope (by date). */
function latestPointsPerScope(points: ComplexityPoint[]): ComplexityPoint[] {
    const byScope = new Map<string, ComplexityPoint[]>();
    for (const p of points) {
        if (!byScope.has(p.scopeId)) byScope.set(p.scopeId, []);
        byScope.get(p.scopeId)!.push(p);
    }
    const latest: ComplexityPoint[] = [];
    for (const [, pts] of byScope) {
        const sorted = [...pts].sort((a, b) => b.date.localeCompare(a.date));
        latest.push(sorted[0]);
    }
    return latest;
}

/**
 * Compute KPI values from GraphQL data.
 *
 * avgComplexity  — mean cyclomaticPerKloc across the LATEST date per repo scope.
 * totalHighComplexity — sum of highComplexityFunctions across latest scope points.
 * hotspotCount   — count of hotspot rows with riskScore > threshold.
 */
export function computeKpis(
    points: ComplexityPoint[],
    hotspotRows: HotspotRow[],
    threshold = 0.5,
): {
    avgComplexity: number | null;
    totalHighComplexity: number;
    hotspotCount: number;
} {
    const latestPerScope = latestPointsPerScope(points);

    const perKlocValues = latestPerScope
        .map((p) => p.cyclomaticPerKloc)
        .filter((v): v is number => v !== null);

    const avgComplexity =
        perKlocValues.length > 0
            ? perKlocValues.reduce((s, v) => s + v, 0) / perKlocValues.length
            : null;

    const totalHighComplexity = latestPerScope.reduce(
        (sum, p) => sum + (p.highComplexityFunctions ?? 0),
        0,
    );

    const hotspotCount = hotspotRows.filter((r) => r.riskScore > threshold).length;

    return { avgComplexity, totalHighComplexity, hotspotCount };
}

/**
 * Count repo scopes whose complexity is rising — latest cyclomaticPerKloc strictly
 * greater than the earliest in-window value for that scope. Real "Rising Areas" KPI.
 */
export function computeRisingAreas(points: ComplexityPoint[]): number {
    const byScope = new Map<string, ComplexityPoint[]>();
    for (const p of points) {
        if (p.cyclomaticPerKloc === null) continue;
        if (!byScope.has(p.scopeId)) byScope.set(p.scopeId, []);
        byScope.get(p.scopeId)!.push(p);
    }
    let rising = 0;
    for (const [, pts] of byScope) {
        if (pts.length < 2) continue;
        const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
        const first = sorted[0].cyclomaticPerKloc;
        const last = sorted[sorted.length - 1].cyclomaticPerKloc;
        if (first !== null && last !== null && last > first) rising += 1;
    }
    return rising;
}
