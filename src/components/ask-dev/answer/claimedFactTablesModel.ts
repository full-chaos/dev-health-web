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
 * - an `X_id` column whose rows also carry `X_name` shows the name in the id's place, and the raw
 *   id is left out (web/AGENTS.md: resolved names, no raw ids); an id with no name column stays;
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
 * Puts each `X_name` column in the place of its `X_id` column, when both are served, and drops the
 * id: the name is the same entity's resolved label.
 */
function namesForIds(order: readonly string[], present: ReadonlySet<string>): string[] {
    const named = order.map((key) => {
        const prefix = /^(.+)_id$/u.exec(key)?.[1];
        return prefix !== undefined && present.has(`${prefix}_name`) ? `${prefix}_name` : key;
    });
    return uniqueInOrder(named);
}

/** The columns of one fact's rows, in declared order when the declaration fits them. */
export function factColumns(fact: ClaimedFact): {
    readonly columns: readonly FactTableColumn[];
    readonly mismatch: FactTableMismatch["reason"] | null;
} {
    const rows: readonly ClaimedFactRow[] = fact.rows ?? [];
    const firstSeen = columnOrder(rows);
    const present = new Set(firstSeen);
    const plain = namesForIds(firstSeen, present).map((key) => ({ key, measure: false }));
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
        columns: order.map((key) => ({
            key,
            measure: measures.has(key) && !table.key.includes(key),
        })),
        mismatch: null,
    };
}

function cellOf(row: ClaimedFactRow, key: string): FactTableCell {
    const value = row.fields[key];
    if (value === undefined) return { kind: "absent" };
    if (cellValue(value) === null) return { kind: "null" };
    return { kind: "value", text: cellText(value) };
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
            rows: (primary.rows ?? []).map((row) =>
                columns.map((column) => cellOf(row, column.key)),
            ),
            mismatch:
                mismatch === null ? null : { claimIndex: facts.indexOf(primary), reason: mismatch },
        };
    });
}
