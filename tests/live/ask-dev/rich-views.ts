/**
 * CHAOS-11946 (I-50): compares what a rich view DRAWS with what ACR SERVED.
 *
 * The served side is the answer's own `render_shapes`, read from the investigation stream
 * (`watchResults`). The drawn side is the view's value table: every chart carries one (ask-dev's
 * `ShapeDataTable`), and its cells print each served value exactly (`String(value)`), so the
 * comparison is a string comparison and needs no tolerance. A point ACR did not serve is a gap
 * ("—"), never a zero (check 12).
 *
 * Pure TypeScript with no Playwright import, so `ci/__tests__/ask-dev-rich-views.test.ts` can plant mismatches
 * and prove each one is reported.
 */

export type ServedPoint = {
    label: string;
    value: number;
    source?: { subject_canonical_id?: string };
};

export type ServedSeries = { key: string; label: string; points: ServedPoint[] };

export type ServedShape = {
    shape_id: string;
    kind: string;
    selected_by: string;
    title: string;
    series: ServedSeries[];
};

export type DrawnRow = { label: string; cells: string[] };

/** The gap mark a value table prints where ACR served no point. */
export const GAP = "—";

/** The shapes the answer served, in served order. No `render_shapes` is none, never an error. */
export function servedShapes(result: unknown): ServedShape[] {
    const shapes = (result as { render_shapes?: unknown } | null | undefined)?.render_shapes;
    return Array.isArray(shapes) ? (shapes as ServedShape[]) : [];
}

/**
 * The rows a faithful value table holds for `shape`: one per label, in the order ACR served them
 * (the union of the series' labels, first seen first); for a cohort, by each member's served
 * attention rank, a label with no rank after the ranked ones.
 */
export function expectedRows(shape: ServedShape, ranks?: ReadonlyMap<string, number>): DrawnRow[] {
    const rankOf = new Map<string, number>();
    for (const series of shape.series) {
        for (const point of series.points) {
            if (rankOf.has(point.label)) continue;
            const rank = ranks?.get(point.source?.subject_canonical_id ?? "");
            rankOf.set(point.label, rank ?? Number.MAX_SAFE_INTEGER);
        }
    }
    // A stable sort: equal ranks (and a non-cohort shape, where all are equal) keep served order.
    const labels = [...rankOf.keys()].sort((left, right) => rankOf.get(left)! - rankOf.get(right)!);
    return labels.map((label) => ({
        label,
        cells: shape.series.map((series) => {
            const point = series.points.find((candidate) => candidate.label === label);
            return point === undefined ? GAP : String(point.value);
        }),
    }));
}

/**
 * Every way the drawn table differs from the served shape, as plain sentences; empty when the
 * table states every served point exactly, in served order, and nothing else.
 */
export function tableMismatches(
    shape: ServedShape,
    drawn: readonly DrawnRow[],
    ranks?: ReadonlyMap<string, number>,
): string[] {
    const expected = expectedRows(shape, ranks);
    const drawnLabels = drawn.map((row) => row.label);
    const servedLabels = expected.map((row) => row.label);
    if (drawnLabels.join("\u0000") !== servedLabels.join("\u0000")) {
        return [`rows drawn [${drawnLabels.join(", ")}], served [${servedLabels.join(", ")}]`];
    }
    const mismatches: string[] = [];
    expected.forEach((row, rowIndex) => {
        const cells = drawn[rowIndex]!.cells;
        if (cells.length !== row.cells.length) {
            mismatches.push(
                `row "${row.label}": ${String(cells.length)} cells drawn, ${String(row.cells.length)} series served`,
            );
            return;
        }
        row.cells.forEach((served, seriesIndex) => {
            const cell = cells[seriesIndex]!;
            if (cell !== served) {
                mismatches.push(
                    `row "${row.label}", series "${shape.series[seriesIndex]!.label}": drawn "${cell}", served "${served}"`,
                );
            }
        });
    });
    return mismatches;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Whether dated marks sit in proportion to elapsed time (a time axis), within `tolerance` of the
 * axis span. A measurement this cannot make (fewer than two marks, a label that is not a date, no
 * span) is reported, never passed.
 */
export function elapsedTimeMismatches(
    marks: ReadonlyArray<{ label: string; x: number }>,
    tolerance = 0.02,
): string[] {
    if (marks.length < 2) return ["fewer than two dated marks: elapsed time cannot be checked"];
    const notDates = marks.filter(
        (mark) => !ISO_DAY.test(mark.label) || Number.isNaN(Date.parse(mark.label)),
    );
    if (notDates.length > 0) return notDates.map((mark) => `mark "${mark.label}" is not a date`);
    const times = marks.map((mark) => Date.parse(mark.label));
    const first = 0;
    const last = marks.length - 1;
    const timeSpan = times[last]! - times[first]!;
    const xSpan = marks[last]!.x - marks[first]!.x;
    if (timeSpan <= 0 || xSpan <= 0)
        return ["the marks span no time or no width: elapsed time cannot be checked"];
    const mismatches: string[] = [];
    marks.forEach((mark, index) => {
        const drawn = (mark.x - marks[first]!.x) / xSpan;
        const elapsed = (times[index]! - times[first]!) / timeSpan;
        if (Math.abs(drawn - elapsed) > tolerance) {
            mismatches.push(
                `mark "${mark.label}" at ${drawn.toFixed(3)} of the axis, elapsed time puts it at ${elapsed.toFixed(3)}`,
            );
        }
    });
    return mismatches;
}

/** A served word, else the term with spaces (ask-dev `vocabularyWord`): never a table of our own. */
export function servedWordOr(
    labels: Readonly<Record<string, string>> | undefined,
    vocabulary: string,
    value: string,
): string {
    const word = labels?.[`${vocabulary}:${value}`]?.trim();
    return word === undefined || word === "" ? value.replaceAll("_", " ") : word;
}

type EvidenceWindow = {
    start?: string;
    end?: string;
    relative_id?: string;
    as_of?: string;
    provenance?: string;
};

/**
 * AC-7 and AC-8: the Coverage panel's window line for a served window (ask-dev
 * `evidenceWindowRange`, then the served provenance word). A missing window is "Not reported.",
 * never a guessed one. `formatDay` is the page's own date form, so the comparison runs in the
 * browser's locale.
 */
/** The ISO instant of a window's last covered day: an end-exclusive UTC midnight is the day before. */
export function lastCoveredIso(end: string): string {
    const at = new Date(end);
    return Number.isNaN(at.getTime()) || at.getTime() % 86_400_000 !== 0
        ? end
        : new Date(at.getTime() - 86_400_000).toISOString();
}

export function evidenceWindowText(
    window: EvidenceWindow | undefined | null,
    labels: Readonly<Record<string, string>> | undefined,
    formatDay: (iso: string) => string,
): string {
    let range: string | undefined;
    if (window?.start !== undefined && window.end !== undefined) {
        range = `${formatDay(window.start)} – ${formatDay(lastCoveredIso(window.end))}`;
    } else if (window?.relative_id !== undefined) {
        range = servedWordOr(labels, "window_relative_id", window.relative_id);
    } else if (window?.as_of !== undefined) {
        range = `As of ${formatDay(window.as_of)}`;
    }
    // A served window also states where it came from, in its served word (ask-dev `CoveragePanel`).
    const provenance =
        window?.provenance === undefined
            ? ""
            : ` · ${servedWordOr(labels, "window_provenance", window.provenance)}`;
    return `Evidence window: ${range ?? "Not reported."}${window == null ? "" : provenance}`;
}

type ClaimedTable = {
    measures?: readonly string[];
    measure_units?: ReadonlyArray<{ measure: string; unit: string }>;
};

/** One drawn column heading: its words without the unit, and the unit word drawn under it. */
export type DrawnHeading = { heading: string; unit: string | null };

/**
 * AC-8: units only as served, column by column (Codex r2 P3: a set of words passed with the units
 * swapped between columns). A claimed measure's column (its served `fact_field` word) states the
 * served word of the one unit its table declares, or no unit when it declares none or has no word;
 * a served unit whose column is not drawn is reported. A column that is no claimed measure (a
 * visible value table under a series label) may only state a word ACR served for a claimed
 * measure. Claims that serve one heading different units cannot be placed, and say so.
 */
export function unitWordMismatches(
    claims: ReadonlyArray<{ table?: ClaimedTable }>,
    labels: Readonly<Record<string, string>> | undefined,
    drawn: readonly DrawnHeading[],
): string[] {
    // Heading → the served unit words for it, "" where the measure states none.
    const expected = new Map<string, Set<string>>();
    // A claimed-fact table draws the claim's `table` only (ask-dev `FactRowsPanel`).
    for (const { table } of claims) {
        for (const measure of table?.measures ?? []) {
            const entries = (table?.measure_units ?? []).filter(
                (entry) => entry.measure === measure,
            );
            const word =
                entries.length === 1
                    ? (labels?.[`measure_unit:${entries[0]!.unit}`]?.trim() ?? "")
                    : "";
            const heading = servedWordOr(labels, "fact_field", measure);
            expected.set(heading, (expected.get(heading) ?? new Set<string>()).add(word));
        }
    }
    const mismatches: string[] = [];
    const placed = new Map<string, string>();
    for (const [heading, words] of expected) {
        if (words.size === 1) {
            placed.set(heading, [...words][0]!);
            continue;
        }
        const listed = [...words].map((word) => (word === "" ? "none" : `"${word}"`));
        mismatches.push(
            `column "${heading}": claims serve the units [${listed.join(", ")}], so no one unit can be checked`,
        );
    }
    const servedWords = new Set([...placed.values()].filter((word) => word !== ""));
    for (const column of drawn) {
        const heading = column.heading.trim();
        const unit = column.unit?.trim() ?? "";
        if (!expected.has(heading)) {
            if (unit !== "" && !servedWords.has(unit)) {
                mismatches.push(
                    `column "${heading}" draws unit "${unit}", not a served unit of any claimed table`,
                );
            }
            continue;
        }
        const served = placed.get(heading);
        if (served === undefined || unit === served) continue;
        if (unit === "") mismatches.push(`column "${heading}" draws no unit, served "${served}"`);
        else if (served === "")
            mismatches.push(`column "${heading}" draws unit "${unit}", served none`);
        else mismatches.push(`column "${heading}" draws unit "${unit}", served "${served}"`);
    }
    const drawnHeadings = new Set(drawn.map((column) => column.heading.trim()));
    for (const [heading, served] of placed) {
        if (served !== "" && !drawnHeadings.has(heading)) {
            mismatches.push(`served unit "${served}" for column "${heading}" is not drawn`);
        }
    }
    return mismatches;
}

/**
 * AC-11: each ranking row shows its served outcome (raw value and word), an absent outcome is a
 * dash, and no two outcomes share one word (checks 8, 12, 13).
 */
export function outcomeWordMismatches(
    rows: ReadonlyArray<{
        outcome: string | undefined;
        drawnValue: string | null;
        drawnWord: string;
    }>,
    labels: Readonly<Record<string, string>> | undefined,
): string[] {
    const mismatches: string[] = [];
    const wordOf = new Map<string, string>();
    rows.forEach((row, index) => {
        const at = `row ${String(index + 1)}`;
        if (row.outcome === undefined) {
            if (row.drawnWord.trim() !== "—")
                mismatches.push(`${at}: no served outcome, drawn "${row.drawnWord}"`);
            return;
        }
        if (row.drawnValue !== row.outcome) {
            mismatches.push(
                `${at}: outcome "${row.outcome}" carries the raw value "${String(row.drawnValue)}"`,
            );
            return;
        }
        const served = servedWordOr(labels, "member_outcome", row.outcome);
        if (row.drawnWord.trim() !== served) {
            mismatches.push(
                `${at}: outcome "${row.outcome}" drawn as "${row.drawnWord}", served word "${served}"`,
            );
            return;
        }
        wordOf.set(row.outcome, served);
    });
    const outcomes = [...wordOf.keys()];
    outcomes.forEach((left, index) => {
        for (const right of outcomes.slice(index + 1)) {
            if (wordOf.get(left) === wordOf.get(right)) {
                mismatches.push(
                    `outcomes "${left}" and "${right}" share the word "${wordOf.get(left)!}"`,
                );
            }
        }
    });
    return mismatches;
}

/**
 * The value columns' headings must be the served series' labels, in served order: a table whose
 * cells match but whose headings are swapped would put each value under the other side's name.
 */
export function headingMismatches(shape: ServedShape, headings: readonly string[]): string[] {
    const served = shape.series.map((series) => series.label);
    return headings.join("\u0000") === served.join("\u0000")
        ? []
        : [`value columns headed [${headings.join(", ")}], served series [${served.join(", ")}]`];
}

type ScalarCell = {
    string?: string;
    integer?: number;
    number?: number;
    boolean?: boolean;
    null?: boolean;
};

type LandscapeAnswer = {
    answer_plan?: { render_kinds?: readonly string[] } | undefined;
    interpretation?: { fact_requirements?: ReadonlyArray<{ kind?: string }> } | undefined;
    subject_resolution?:
        { committed?: ReadonlyArray<{ kind?: string; canonical_id?: string }> } | undefined;
    claimed_facts?: readonly LandscapeClaim[] | undefined;
};

type LandscapeClaim = {
    kind?: string;
    subject?: { kind?: string; canonical_id?: string };
    field?: string;
    value?: ScalarCell;
    fact_id?: string;
    derived_from?: readonly unknown[];
    table?: {
        field?: string;
        shape?: string;
        key?: readonly string[];
        measures?: readonly string[];
    };
    rows?: ReadonlyArray<{ fields: Readonly<Record<string, ScalarCell>> }>;
};

const LANDSCAPE_X = "churn_loc_30d";
const LANDSCAPE_Y = "delivery_units_30d";
const LANDSCAPE_DAY = "as_of_day";
const LANDSCAPE_IDENTITIES = "identity_count";
const LANDSCAPE_MIN_IDENTITIES = 2;
/** acr `ContextFabricRenderPointsMaxCount` (= `ContextFabricClaimedFactMaxRows`, 64). */
const LANDSCAPE_MAX_SIDES = 64;

/**
 * CHAOS-12676: whether the served answer itself shows the quadrant gap's cause. acr refuses a
 * quadrant whose teams' landscape rows speak for different days (`landscape_days_differ`), and it
 * logs that reason without serving it, so the known gap is read from the claims instead: each
 * team's point is placed by acr's own rules (`landscapeSideOf`, `landscapeRowOf`: one x and one y
 * claim, not derived, from one fact and one `area_breakdown` row keyed by `as_of_day`, at least
 * two identities, each claim stating its row's own cell), and the gap holds only when two or more
 * placed teams carry different days. acr's earlier refusals (no quadrant in the plan, no landscape
 * requirement, fewer than two or more than 64 committed sides, a side that is not a team) are read
 * from the answer first and never count as the gap. Codex r1 and r2 on #1803 found the same class: a KNOWN GAP
 * that absorbs another failure. A missing quadrant without this cause is a real failure.
 */
export function landscapeGap(answer: LandscapeAnswer): {
    placed: Array<{ subject: string; day: string }>;
    differ: boolean;
} {
    const none = { placed: [], differ: false };
    // acr's checks before any day, in its order (`landscapePositionShape`): a quadrant in the plan,
    // a landscape requirement, two to 64 committed sides, every side a team.
    if (answer.answer_plan?.render_kinds?.includes("quadrant") !== true) return none;
    if (answer.interpretation?.fact_requirements?.some((r) => r.kind === "landscape") !== true) {
        return none;
    }
    const sides = answer.subject_resolution?.committed ?? [];
    if (sides.length < 2 || sides.length > LANDSCAPE_MAX_SIDES) return none;
    if (sides.some((side) => side.kind !== "team")) return none;
    const landscape = (answer.claimed_facts ?? []).filter((claim) => claim.kind === "landscape");
    const placed: Array<{ subject: string; day: string }> = [];
    for (const subject of sides.map((side) => side.canonical_id ?? "")) {
        const own = landscape.filter(
            (claim) =>
                claim.subject?.canonical_id === subject && (claim.derived_from?.length ?? 0) === 0,
        );
        const xs = own.filter((claim) => claim.field === LANDSCAPE_X);
        const ys = own.filter((claim) => claim.field === LANDSCAPE_Y);
        if (xs.length !== 1 || ys.length !== 1) continue;
        const x = xs[0]!;
        const y = ys[0]!;
        // One fact, one row (acr `sameThemeBreakdown`).
        if (
            x.fact_id !== y.fact_id ||
            JSON.stringify(x.table) !== JSON.stringify(y.table) ||
            JSON.stringify(x.rows) !== JSON.stringify(y.rows)
        ) {
            continue;
        }
        const table = x.table;
        if (
            table?.field !== "area_breakdown" ||
            x.rows?.length !== 1 ||
            table.key?.length !== 1 ||
            table.key[0] !== LANDSCAPE_DAY
        ) {
            continue;
        }
        const fields = x.rows[0]!.fields;
        const day = fields[LANDSCAPE_DAY]?.string ?? "";
        const identities = fields[LANDSCAPE_IDENTITIES]?.integer;
        if (day === "" || identities === undefined || identities < LANDSCAPE_MIN_IDENTITIES)
            continue;
        const cellOf = (measure: string) =>
            (table.measures ?? []).includes(measure) ? fields[measure]?.integer : undefined;
        const xCell = cellOf(LANDSCAPE_X);
        const yCell = cellOf(LANDSCAPE_Y);
        if (xCell === undefined || yCell === undefined) continue;
        if (x.value?.integer !== xCell || y.value?.integer !== yCell) continue;
        placed.push({ subject, day });
    }
    return {
        placed,
        differ: placed.length >= 2 && placed.some((side) => side.day !== placed[0]!.day),
    };
}
