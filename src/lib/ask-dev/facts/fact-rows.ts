// Ported 1:1 from ask-dev `src/lib/fact-rows.ts` and `src/lib/presentation.ts` (`humanizeTerm`) at
// the pinned `scripts/ask-dev-oracle/ASK_DEV_SHA` (CHAOS-11941, E8 design §3, §5.1). Only the
// helpers the verifier and the claimed-fact tables use are ported; ask-dev's local chart heuristics
// (`selectPresentation`, `factRowTiles`, `findRollupBasis`) are not: web draws only served shapes.
// The bodies are unchanged; `pnpm test:ask-dev-oracle` compares them with ask-dev's executed code.
/**
 * CHAOS-4355: table/chart selection for a claimed fact's OPTIONAL renderable
 * table (`ClaimedFact.rows`, CHAOS-4347).
 *
 * Pure functions only — no rendering, no I/O. The workbench never re-derives
 * a fact's own numbers; this module only decides HOW the rows the service
 * already sent should be laid out (table vs. chart) and reads the
 * `rollup_basis` sibling claim the producer emits alongside a rollup
 * (`devhealthfacts/metrics.go`'s project rollup), never computes one.
 */
import type { ClaimedFact, ClaimedFactRow, ScalarValue } from "@/lib/ask-dev/render/contracts";

export type Cell = string | number | boolean | null;

/** Unwraps a closed-vocabulary `ScalarValue` to its JS primitive. */
export function cellValue(value: ScalarValue): Cell {
    if (value.string !== undefined) return value.string;
    if (value.integer !== undefined) return value.integer;
    if (value.number !== undefined) return value.number;
    if (value.boolean !== undefined) return value.boolean;
    return null;
}

/** Renders a cell for the table view. Never throws on a missing/null value. */
export function cellText(value: ScalarValue | undefined): string {
    if (value === undefined) return "—";
    const cell = cellValue(value);
    if (cell === null) return "—";
    if (typeof cell === "boolean") return cell ? "true" : "false";
    return String(cell);
}

/** Column names, first-seen order across every row (rows may not share every column). */
export function columnOrder(rows: readonly ClaimedFactRow[]): string[] {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const row of rows) {
        for (const key of Object.keys(row.fields)) {
            if (!seen.has(key)) {
                seen.add(key);
                order.push(key);
            }
        }
    }
    return order;
}

// ISO 8601 date or date-time — the shape every producer in this codebase
// emits for a "day" column (devhealthfacts, e.g. `toString(day)` off a
// ClickHouse `Date`), plus room for a full timestamp. Captures the
// calendar-date digits (year/month/day) so `parseIsoDate` can validate them
// directly, independent of any time/offset suffix.
const ISO_DATE_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * True when (year, month, day) is a real calendar date — `Date.UTC` itself
 * normalizes an out-of-range value instead of rejecting it (day 30 of
 * February rolls forward into March), so the constructed date's own
 * component getters are read back and compared against the input.
 */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
    const constructed = new Date(Date.UTC(year, month - 1, day));
    return (
        constructed.getUTCFullYear() === year &&
        constructed.getUTCMonth() === month - 1 &&
        constructed.getUTCDate() === day
    );
}

/**
 * Parses an ISO date/date-time to epoch millis, or null if it does not
 * represent a real calendar date. The year/month/day are validated as
 * literal digits from the string via `isValidCalendarDate` — never by
 * round-tripping `Date.parse`'s own output through a UTC-based
 * re-serialization, which `Date.parse` itself would silently normalize
 * (`2026-02-30` becomes March 2) and which breaks for a value that carries
 * a non-UTC offset (its UTC calendar day can legitimately differ from the
 * literal date it names) — codex rounds 2 and 3, CHAOS-4355. This makes the
 * check correct for a bare date AND a full offset timestamp alike, by
 * validating the calendar digits directly instead of anything timezone-
 * shifted.
 */
export function parseIsoDate(value: string): number | null {
    const match = ISO_DATE_PATTERN.exec(value);
    if (match === null) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    const millis = Date.parse(value);
    return Number.isNaN(millis) ? null : millis;
}

/** The claimed facts a per-fact panel actually renders: non-empty `rows` only. */
export function factsWithRows(facts: readonly ClaimedFact[]): ClaimedFact[] {
    return facts.filter((fact) => fact.rows !== undefined && fact.rows.length > 0);
}

/**
 * CHAOS-4672: a table-identity fingerprint for a claimed fact's `rows`.
 *
 * The producer attaches the WHOLE row table to every claim that cites it —
 * one measure names the claim's own `field`, but `rows` carries every
 * numeric column regardless (`devhealthfacts`' rollup pattern, same one
 * `findRollupBasis` above reads). Two claims whose `subject` + `kind` +
 * `rows` all match byte-for-byte are the SAME table cited twice, not two
 * tables — there is no separate wire-level table id (that is CHAOS-4627's
 * job; this ticket is the client-side dedupe that composes with it, per the
 * ticket's own sequencing note). `rows` reaches the client from Go's
 * `encoding/json`, which marshals a map's keys in SORTED order (the same
 * fact `ordinalAxisPreferenceScore`'s doc comment relies on), so the SAME
 * underlying table serializes identically on every claim that carries it —
 * `JSON.stringify` is a safe content fingerprint here, not a heuristic.
 */
export function tableIdentity(fact: ClaimedFact): string {
    return JSON.stringify([fact.subject.kind, fact.subject.canonical_id, fact.kind, fact.rows]);
}

export type FactGroup = {
    /** The first claim (first-seen order) to cite this table — its `kind`/`field` titles the panel. */
    readonly primary: ClaimedFact;
    /** Every OTHER claim citing the same table, first-seen order — referenced, never re-plotted. */
    readonly alsoClaims: readonly ClaimedFact[];
};

/**
 * CHAOS-4672: groups claims that cite the SAME table (`tableIdentity`) so a
 * shared table renders its chart/table exactly ONCE, not once per claim.
 * The group's `primary` is whichever claim reached the table FIRST, in the
 * order `facts` was given (the order the service emitted them) — the same
 * first-seen tiebreak this module already uses elsewhere (`columnOrder`,
 * `selectPresentation`'s axis pick), so the panel a reader sees is
 * deterministic from the answer alone, never from iteration order of a Map.
 * Callers pass `factsWithRows(facts)` — a fact with no rows has no table to
 * group by.
 */
export function groupFactsByTable(facts: readonly ClaimedFact[]): readonly FactGroup[] {
    const order: string[] = [];
    const groups = new Map<string, ClaimedFact[]>();
    for (const candidate of facts) {
        const key = tableIdentity(candidate);
        const existing = groups.get(key);
        if (existing === undefined) {
            order.push(key);
            groups.set(key, [candidate]);
        } else {
            existing.push(candidate);
        }
    }
    return order.map((key) => {
        const [primary, ...alsoClaims] = groups.get(key)!;
        return { primary: primary!, alsoClaims };
    });
}

/**
 * Renders a `snake_case` contract term for reading, without losing it: callers
 * show this next to (or as the title of) the raw term.
 */
export function humanizeTerm(term: string): string {
    return term.replaceAll("_", " ");
}
