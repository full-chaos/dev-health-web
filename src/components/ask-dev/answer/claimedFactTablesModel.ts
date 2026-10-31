import {
    cellText,
    cellValue,
    columnOrder,
    factsWithRows,
    groupFactsByTable,
} from "@/lib/ask-dev/facts/fact-rows";
import type { ClaimedFact, ClaimedFactRow } from "@/lib/ask-dev/render/contracts";

/**
 * The claimed-fact tables of one answer (CHAOS-11945, E8 design §11). The grouping and the cell
 * reading are the I-26 ports of ask-dev (`groupFactsByTable`, `factsWithRows`, `columnOrder`,
 * `cellValue`, `cellText`), compared with ask-dev by the oracle. What this module adds is web's
 * own (tested here, not by the oracle):
 *
 * - declared column order: the producer's `table` declaration (key, then measures, then
 *   observations, then any undeclared column in first-seen order). A declared measure or
 *   observation that no row has keeps its column (the schema allows it to be absent): every cell
 *   says "not in this row". A declared KEY column that no row has means the declaration does not
 *   describe these rows: first-seen order is used and the mismatch is reported (`mismatch`).
 * - an `X_id` column whose rows also carry `X_name` shows the name in the id's place (web/AGENTS.md:
 *   resolved names, no raw ids); a row with no name (absent or null) shows its served id there, so
 *   no row loses its key; an id with no name column stays;
 * - measure columns are marked;
 * - an absent cell and an explicit null are told apart, both shown as a dash, never as 0
 *   (check 17); no row is ever added.
 *
 * A dual-table fact shows its `rows`; its `time_series_rows` are the trend's (I-24).
 */

export type FactTableColumn = {
    /** The served column name, shown in the header's title. */
    readonly key: string;
    readonly measure: boolean;
    /**
     * Set when this `X_name` column stands in the place of the served `X_id` column: a row whose
     * name is absent or null shows its served id instead, so no row loses its key.
     */
    readonly idKey?: string;
};

export type FactTableCell =
    | { readonly kind: "value"; readonly text: string }
    | { readonly kind: "null" }
    | { readonly kind: "absent" };

export type FactTableMismatch = {
    /** The index of the primary claim in the answer's `claimed_facts`. */
    readonly claimIndex: number;
    readonly reason: "key_column_missing";
};

export type FactTableModel = {
    /** The primary claim, then every other claim citing the same table (the trend slot's ids). */
    readonly claimIds: readonly string[];
    readonly kind: string;
    /** What the table is: the declaration's field, else the primary claim's own field. */
    readonly tableField: string;
    readonly subjectLabel: string | null;
    /** The fields of the other claims that cite this table, in served order. */
    readonly alsoFields: readonly string[];
    readonly columns: readonly FactTableColumn[];
    readonly rows: readonly (readonly FactTableCell[])[];
    readonly mismatch: FactTableMismatch | null;
};

function uniqueInOrder(names: readonly string[]): string[] {
    const seen = new Set<string>();
    return names.filter((name) => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
    });
}

/**
 * Puts each `X_name` column in the place of its `X_id` column, when the rows carry both: the name is
 * the same entity's resolved label. The column keeps the id key for the rows that have no name.
 */
function namesForIds(
    order: readonly string[],
    present: ReadonlySet<string>,
): { readonly key: string; readonly idKey?: string }[] {
    const named = order.map((key) => {
        const prefix = /^(.+)_id$/u.exec(key)?.[1];
        // Only when the rows carry BOTH: a declared id or name that no row has keeps its own
        // column of dashes (a declared column is never dropped).
        return prefix !== undefined && present.has(key) && present.has(`${prefix}_name`)
            ? { idKey: key, key: `${prefix}_name` }
            : { key };
    });
    // One column per name, at its first place; when the name came before its id, the kept column
    // still takes the id's fallback, so a row with no name keeps its served id whatever the order.
    const merged: { key: string; idKey?: string }[] = [];
    const at = new Map<string, number>();
    for (const column of named) {
        const index = at.get(column.key);
        if (index === undefined) {
            at.set(column.key, merged.length);
            merged.push({ ...column });
        } else if (column.idKey !== undefined && merged[index]!.idKey === undefined) {
            merged[index] = { ...merged[index]!, idKey: column.idKey };
        }
    }
    return merged;
}

/** The columns of one fact's rows, in declared order when the declaration fits them. */
export function factColumns(fact: ClaimedFact): {
    readonly columns: readonly FactTableColumn[];
    readonly mismatch: FactTableMismatch["reason"] | null;
} {
    const rows: readonly ClaimedFactRow[] = fact.rows ?? [];
    const firstSeen = columnOrder(rows);
    const present = new Set(firstSeen);
    const plain = namesForIds(firstSeen, present).map((column) => ({ ...column, measure: false }));
    const table = fact.table;
    if (table === undefined) return { columns: plain, mismatch: null };
    if (!table.key.every((key) => present.has(key))) {
        return { columns: plain, mismatch: "key_column_missing" };
    }
    const measures = new Set(table.measures ?? []);
    const declared = uniqueInOrder([
        ...table.key,
        ...(table.measures ?? []),
        ...(table.observations ?? []),
    ]);
    const declaredSet = new Set(declared);
    const order = namesForIds(
        [...declared, ...firstSeen.filter((key) => !declaredSet.has(key))],
        present,
    );
    return {
        columns: order.map((column) => ({
            ...column,
            measure: measures.has(column.key) && !table.key.includes(column.key),
        })),
        mismatch: null,
    };
}

function readCell(value: ClaimedFactRow["fields"][string]): FactTableCell {
    if (value === undefined) return { kind: "absent" };
    if (cellValue(value) === null) return { kind: "null" };
    return { kind: "value", text: cellText(value) };
}

function cellOf(row: ClaimedFactRow, column: FactTableColumn): FactTableCell {
    const own = readCell(row.fields[column.key]);
    if (column.idKey === undefined || own.kind === "value") return own;
    // This row has no name: its served id stands in, when it has one.
    const id = readCell(row.fields[column.idKey]);
    return id.kind === "absent" ? own : id;
}

/** One table per cited table (claims citing the same table are one group), in served order. */
export function claimedFactTables(facts: readonly ClaimedFact[]): readonly FactTableModel[] {
    return groupFactsByTable(factsWithRows(facts)).map(({ primary, alsoClaims }) => {
        const { columns, mismatch } = factColumns(primary);
        return {
            claimIds: [primary.claim_id, ...alsoClaims.map((claim) => claim.claim_id)],
            kind: primary.kind,
            tableField: primary.table?.field ?? primary.field,
            subjectLabel: primary.subject.label?.trim() ? primary.subject.label : null,
            alsoFields: alsoClaims.map((claim) => claim.field),
            columns,
            rows: (primary.rows ?? []).map((row) => columns.map((column) => cellOf(row, column))),
            mismatch:
                mismatch === null ? null : { claimIndex: facts.indexOf(primary), reason: mismatch },
        };
    });
}
