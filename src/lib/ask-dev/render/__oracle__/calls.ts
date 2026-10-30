/**
 * The calls the E8 differential oracle compares (CHAOS-11941, design §6.1), as ONE function over a
 * library object, so ask-dev's executed modules and web's ports are driven identically. Every call's
 * complete return value (or the error it threw) is recorded with tagged leaves: no field subset, no
 * number that could be equal only after a lossy JSON round trip.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the two libraries are compared, not typed */
export type OracleLib = {
    verifyRenderShape: (shape: any, result: any) => unknown;
    renderShapesFor: (result: any, rules: readonly string[]) => unknown;
    trendShapesForClaim: (result: any, claimId: string) => unknown;
    trendChartSourceCounts: (result: any) => unknown;
    COHORT_SHAPE_RULES: readonly string[];
    cohortRanking: (shape: any, cohort: any) => unknown;
    rankingTable: (members: any) => unknown;
    topDriversByWeightContributed: (drivers: any, n: number) => unknown;
    rowWindow: (drivers: any) => unknown;
    formatCohortScore: (score: number) => unknown;
    isRankableSubjectKind: (kind: string) => unknown;
    cellValue: (value: any) => unknown;
    cellText: (value: any) => unknown;
    columnOrder: (rows: any) => unknown;
    factsWithRows: (facts: any) => any[];
    tableIdentity: (fact: any) => unknown;
    groupFactsByTable: (facts: any) => readonly { primary: any; alsoClaims: readonly any[] }[];
    humanizeTerm: (term: string) => unknown;
    formatValue: (value: number) => unknown;
    formatDisplay: (value: number) => unknown;
    trendsForGroup: (result: any, claimIds: readonly string[]) => unknown;
};

export type Tagged =
    | { t: "null" | "undefined" }
    | { t: "boolean" | "number" | "string" | "bigint"; v: string }
    | { t: "array"; v: Tagged[] }
    | { t: "object"; v: [string, Tagged][] }
    | { t: "error"; v: string };

/** Every leaf as its type and exact string form: `-0`, `1e21` and 2^53 neighbours stay distinct. */
export function tag(value: unknown): Tagged {
    if (value === null) return { t: "null" };
    if (value === undefined) return { t: "undefined" };
    if (typeof value === "number")
        return { t: "number", v: Object.is(value, -0) ? "-0" : String(value) };
    if (typeof value === "boolean" || typeof value === "string" || typeof value === "bigint") {
        return { t: typeof value as "boolean" | "string" | "bigint", v: String(value) };
    }
    if (Array.isArray(value)) return { t: "array", v: value.map(tag) };
    if (typeof value === "object") {
        return { t: "object", v: Object.entries(value).map(([k, v]) => [k, tag(v)]) };
    }
    return { t: "string", v: `<${typeof value}>` };
}

function run(fn: () => unknown): Tagged {
    try {
        return tag(fn());
    } catch (error) {
        return {
            t: "error",
            v: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        };
    }
}

/** Boundary values for the number formatters (design §6.1). */
export const FORMAT_BOUNDARY_VALUES: readonly number[] = [
    0,
    -0,
    0.004,
    0.005,
    2.675,
    46.666666666666664,
    1e21,
    -12.5,
    2 ** 53 - 1,
];

/** The interpreted shapes `cohortRanking` is asked about, besides the served one. */
export const DOCUMENTED_SHAPES = ["single_subject", "explicit_cohort", "discovered_cohort", "open"];

const SINGLE_RULES = ["cohort_attention_score", "cohort_driver_contribution", "dated_fact_trend"];

/** Every compared call for one result, in a fixed order: `[call label, tagged complete return]`. */
export function oracleCalls(L: OracleLib, result: any, extraKinds: readonly string[] = []) {
    const out: [string, Tagged][] = [];
    const push = (label: string, fn: () => unknown) => out.push([label, run(fn)]);
    const shapes: any[] = Array.isArray(result?.render_shapes) ? result.render_shapes : [];
    const facts: any[] = Array.isArray(result?.claimed_facts) ? result.claimed_facts : [];
    const cohort = result?.cohort;
    const members: any[] = Array.isArray(cohort?.members) ? cohort.members : [];

    shapes.forEach((shape, i) =>
        push(`verifyRenderShape[${i}]`, () => L.verifyRenderShape(shape, result)),
    );
    for (const rule of SINGLE_RULES)
        push(`renderShapesFor[${rule}]`, () => L.renderShapesFor(result, [rule]));
    push("renderShapesFor[COHORT_SHAPE_RULES]", () =>
        L.renderShapesFor(result, L.COHORT_SHAPE_RULES),
    );
    push("COHORT_SHAPE_RULES", () => L.COHORT_SHAPE_RULES);
    const claimIds = new Set<string>(
        facts.map((f) => f?.claim_id).filter((x) => typeof x === "string"),
    );
    for (const shape of shapes) {
        for (const series of shape?.series ?? []) {
            for (const point of series?.points ?? []) {
                if (typeof point?.source?.claim_id === "string")
                    claimIds.add(point.source.claim_id);
            }
        }
    }
    for (const claimId of claimIds)
        push(`trendShapesForClaim[${claimId}]`, () => L.trendShapesForClaim(result, claimId));
    push("trendChartSourceCounts", () => L.trendChartSourceCounts(result));

    const served = result?.interpretation?.shape;
    for (const shape of [served, ...DOCUMENTED_SHAPES]) {
        push(`cohortRanking[${String(shape)}]`, () => L.cohortRanking(shape, cohort));
    }
    if (cohort !== undefined) push("rankingTable", () => L.rankingTable(members));
    members.forEach((member, i) => {
        const drivers = member?.drivers ?? [];
        push(`topDriversByWeightContributed[${i}]`, () =>
            L.topDriversByWeightContributed(drivers, 2),
        );
        push(`rowWindow[${i}]`, () => L.rowWindow(drivers));
        if (typeof member?.score === "number")
            push(`formatCohortScore[${i}]`, () => L.formatCohortScore(member.score));
    });
    const kinds = new Set<string>(extraKinds);
    if (typeof cohort?.kind === "string") kinds.add(cohort.kind);
    for (const member of members)
        if (typeof member?.subject?.kind === "string") kinds.add(member.subject.kind);
    for (const kind of kinds)
        push(`isRankableSubjectKind[${kind}]`, () => L.isRankableSubjectKind(kind));

    push("factsWithRows", () => L.factsWithRows(facts));
    facts.forEach((fact, i) => {
        push(`tableIdentity[${i}]`, () => L.tableIdentity(fact));
        for (const key of ["rows", "time_series_rows"] as const) {
            const rows: any[] = Array.isArray(fact?.[key]) ? fact[key] : [];
            if (rows.length === 0) continue;
            push(`columnOrder[${i}.${key}]`, () => L.columnOrder(rows));
            rows.forEach((row, r) => {
                for (const [column, value] of Object.entries(row?.fields ?? {})) {
                    push(`cellValue[${i}.${key}.${r}.${column}]`, () => L.cellValue(value));
                    push(`cellText[${i}.${key}.${r}.${column}]`, () => L.cellText(value));
                }
            });
            for (const column of Object.keys(rows[0]?.fields ?? {}))
                push(`humanizeTerm[${column}]`, () => L.humanizeTerm(column));
        }
    });
    let groups: readonly { primary: any; alsoClaims: readonly any[] }[] = [];
    push("groupFactsByTable", () => (groups = L.groupFactsByTable(L.factsWithRows(facts))));
    groups.forEach((group, i) => {
        const ids = [group.primary, ...group.alsoClaims].map((fact) => fact?.claim_id);
        push(`trendsForGroup[${i}]`, () => L.trendsForGroup(result, ids));
    });
    push("trendsForGroup[undefined]", () => L.trendsForGroup(undefined, []));

    // A list, not a Set alone: a Set folds -0 into 0, and -0 is a boundary value of its own.
    const values: number[] = [...FORMAT_BOUNDARY_VALUES];
    const seen = new Set<number>(values);
    const addValue = (value: number) => {
        if (!seen.has(value)) {
            seen.add(value);
            values.push(value);
        }
    };
    for (const shape of shapes) {
        for (const series of shape?.series ?? []) {
            for (const point of series?.points ?? [])
                if (typeof point?.value === "number") addValue(point.value);
        }
    }
    for (const member of members) if (typeof member?.score === "number") addValue(member.score);
    for (const value of values) {
        const key = Object.is(value, -0) ? "-0" : String(value);
        push(`formatValue[${key}]`, () => L.formatValue(value));
        push(`formatDisplay[${key}]`, () => L.formatDisplay(value));
    }
    return out;
}
