import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cellText, cellValue, columnOrder } from "@/lib/ask-dev/facts/fact-rows";
import type { ClaimedFact, ClaimedFactRow } from "@/lib/ask-dev/render/contracts";

import { claimedFactTables, type FactTableModel } from "../claimedFactTablesModel";

/**
 * CHAOS-11945, the id-to-name swap as ONE class (lead ruling after review rounds 1-3, each of
 * which found one case of it): over every row of every capture and over generated edge rows, a
 * served id is never hidden and a column is never lost.
 *
 * For each row and each `X_id` column with a value in that row, the cell shown for that entity is a
 * value: the row's `X_name` when it is a string with visible text, else the served id. It is never
 * empty and never a dash. Every served column and every declared column (key, measures,
 * observations) is shown, as its own column, or as the id behind a name column when some row serves
 * that id (a declared id served nowhere keeps its own column of dashes).
 */

const CAPTURE_DIRS = [
    join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures"),
    join(process.cwd(), "src/lib/ask-dev/render/__oracle__/captures"),
];

function captureFacts(): { readonly source: string; readonly facts: ClaimedFact[] }[] {
    return CAPTURE_DIRS.flatMap((dir) =>
        readdirSync(dir)
            .filter((file) => file.endsWith(".json") && file !== "index.json")
            .map((file) => {
                const parsed = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
                    result?: { claimed_facts?: ClaimedFact[] };
                    claimed_facts?: ClaimedFact[];
                };
                return {
                    facts: parsed.result?.claimed_facts ?? parsed.claimed_facts ?? [],
                    source: file,
                };
            }),
    );
}

type Name = ClaimedFactRow["fields"][string];

const NAME_CASES: readonly [string, Name][] = [
    ["missing", undefined],
    ["null", { null: true }],
    ["empty", { string: "" }],
    ["blank", { string: "  \t" }],
    ["number", { integer: 7 }],
    ["boolean", { boolean: true }],
    ["readable", { string: "Synthetic Scope" }],
];

function edgeRows(): ClaimedFactRow[] {
    return NAME_CASES.map(([label, name], index) => ({
        fields: {
            scope_id: { string: `scope:${index}:${label}` },
            ...(name === undefined ? {} : { scope_name: name }),
            count: { integer: index },
        },
    }));
}

function edgeFact(
    claimId: string,
    rows: ClaimedFactRow[],
    table?: ClaimedFact["table"],
): ClaimedFact {
    return {
        claim_id: claimId,
        field: "count",
        kind: "pull_requests",
        rows,
        subject: { canonical_id: `subject:${claimId}`, kind: "project", label: "Synthetic" },
        value: { integer: rows.length },
        ...(table === undefined ? {} : { table }),
    };
}

/** Generated facts: every name case, the name before and after the id, ids or names served nowhere. */
function generatedFacts(): ClaimedFact[] {
    const rows = edgeRows();
    const nameFirstRows = rows.map((row) => ({
        fields: Object.fromEntries(Object.entries(row.fields).reverse()),
    }));
    const noIdRows = rows.map((row) => ({
        fields: Object.fromEntries(
            Object.entries(row.fields).filter(([key]) => key !== "scope_id"),
        ),
    }));
    const noNameRows = rows.map((row) => ({
        fields: Object.fromEntries(
            Object.entries(row.fields).filter(([key]) => key !== "scope_name"),
        ),
    }));
    const breakdown = (key: string[], observations: string[]) => ({
        field: "scope_breakdown",
        key: key as [string],
        measures: ["count"],
        observations,
        shape: "breakdown" as const,
    });
    return [
        edgeFact("undeclared-id-first", rows),
        edgeFact("undeclared-name-first", nameFirstRows),
        edgeFact("declared-id-key", rows, breakdown(["scope_id"], ["scope_name"])),
        edgeFact("declared-name-key", rows, breakdown(["scope_name"], ["scope_id"])),
        edgeFact("declared-id-served-nowhere", noIdRows, breakdown(["scope_name"], ["scope_id"])),
        edgeFact(
            "declared-name-served-nowhere",
            noNameRows,
            breakdown(["scope_id"], ["scope_name"]),
        ),
        edgeFact("id-null-in-a-row", [
            ...rows,
            { fields: { scope_id: { null: true }, scope_name: { string: "Named" } } },
        ]),
    ];
}

function readableName(value: Name): string | null {
    return typeof value?.string === "string" && value.string.trim() !== "" ? value.string : null;
}

/** Every violation of the class invariant in one fact's table, as readable lines. */
function violations(fact: ClaimedFact, model: FactTableModel): string[] {
    const out: string[] = [];
    const rows = fact.rows ?? [];
    const declared = fact.table
        ? [...fact.table.key, ...(fact.table.measures ?? []), ...(fact.table.observations ?? [])]
        : [];
    const served = new Set(columnOrder(rows));
    for (const name of new Set([...served, ...declared])) {
        // Shown as its own column; an id may instead stand behind a name column, but only when some
        // row serves that id: a declared id served nowhere keeps its own column of dashes.
        const shown = model.columns.some(
            (column) => column.key === name || (column.idKey === name && served.has(name)),
        );
        if (!shown) out.push(`${fact.claim_id}: column ${name} is not shown`);
    }
    rows.forEach((row, rowIndex) => {
        for (const [key, value] of Object.entries(row.fields)) {
            const prefix = /^(.+)_id$/u.exec(key)?.[1];
            if (prefix === undefined || value === undefined || cellValue(value) === null) continue;
            const id = cellText(value);
            const columnIndex = model.columns.findIndex(
                (column) => column.key === key || column.idKey === key,
            );
            const cell = model.rows[rowIndex]?.[columnIndex];
            const where = `${fact.claim_id} row ${rowIndex} ${key}`;
            if (cell === undefined) {
                out.push(`${where}: no cell`);
            } else if (cell.kind !== "value") {
                out.push(`${where}: shown as ${cell.kind} while the id ${id} is served`);
            } else if (cell.text.trim() === "") {
                out.push(`${where}: shown empty while the id ${id} is served`);
            } else if (
                cell.text !== id &&
                cell.text !== readableName(row.fields[`${prefix}_name`])
            ) {
                out.push(`${where}: shows ${JSON.stringify(cell.text)}, not the name or the id`);
            }
        }
    });
    return out;
}

function checkAll(facts: readonly ClaimedFact[]): string[] {
    const models = claimedFactTables(facts);
    return models.flatMap((model) => {
        const fact = facts.find((candidate) => candidate.claim_id === model.claimIds[0])!;
        return violations(fact, model);
    });
}

describe("the id-to-name swap never hides a served id or drops a column (CHAOS-11945)", () => {
    it("holds over every row of every capture", () => {
        const captures = captureFacts();
        const rowsChecked = captures.reduce(
            (total, { facts }) =>
                total + facts.reduce((sum, fact) => sum + (fact.rows?.length ?? 0), 0),
            0,
        );
        // A scan that sees no rows proves nothing.
        expect(rowsChecked).toBeGreaterThan(100);
        expect(
            captures.some(({ facts }) =>
                facts.some((fact) => fact.rows?.some((row) => "scope_id" in row.fields)),
            ),
        ).toBe(true);
        expect(
            captures.flatMap(({ source, facts }) => checkAll(facts).map((v) => `${source}: ${v}`)),
        ).toEqual([]);
    });

    it("holds over generated rows: every name case, either order, ids and names served nowhere", () => {
        const facts = generatedFacts();
        expect(facts.reduce((sum, fact) => sum + (fact.rows?.length ?? 0), 0)).toBeGreaterThan(40);
        expect(checkAll(facts)).toEqual([]);
    });
});
