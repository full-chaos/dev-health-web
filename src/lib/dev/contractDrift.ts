import * as Sentry from "@sentry/nextjs";

import type { UnknownContractProperty } from "./jsonSchemaValidation";

/**
 * Observability for a server that has moved ahead of this build's pinned Ask Dev
 * contract.
 *
 * Undeclared response properties and unrecognised enum values no longer fail a
 * run (see the must-ignore note in `jsonSchemaValidation.ts`), which removes an
 * outage but would otherwise remove the signal with it: a silently-ignored new
 * field is exactly the state where "the pin is stale" needs to be visible
 * WITHOUT a reader ever seeing a failure. So every ignored surface is counted
 * and reported once.
 *
 * NAMES ONLY, NEVER VALUES. An undeclared field is content this build cannot
 * reason about; copying its value into a log or breadcrumb would move payload
 * data somewhere it was never cleared for. The key path is all that is needed
 * to know a re-pin is due.
 */

export type ContractDriftKind = "unknown_property" | "unknown_enum_value";

export type ContractDriftRecord = Readonly<{
    kind: ContractDriftKind;
    /** The pinned schema the payload was validated against. */
    schemaVersion: string;
    /** Location of the offending key, or of the field holding the value. */
    path: string;
    /**
     * The undeclared property name, or the unrecognised enum MEMBER. An enum
     * member is machine vocabulary from the contract itself, not reader content
     * or free text, which is why it is safe to name where a value never is.
     */
    name: string;
}>;

export type ContractDriftSink = (record: ContractDriftRecord) => void;

const seen = new Set<string>();
const records: ContractDriftRecord[] = [];

function fingerprint(record: ContractDriftRecord): string {
    return `${record.kind}:${record.schemaVersion}:${record.path}:${record.name}`;
}

/**
 * The default sink. Reports each distinct drift once per session — a new field
 * on a per-event payload would otherwise emit on every frame of every run.
 */
function defaultSink(record: ContractDriftRecord): void {
    Sentry.captureMessage(
        `Ask Dev contract drift: ${record.kind} ${record.schemaVersion}${record.path}/${record.name}`,
        "warning",
    );
}

let sink: ContractDriftSink = defaultSink;

/** Swap the sink (tests, or a different transport). Returns the previous one. */
export function setContractDriftSink(next: ContractDriftSink): ContractDriftSink {
    const previous = sink;
    sink = next;
    return previous;
}

export function reportContractDrift(record: ContractDriftRecord): void {
    const key = fingerprint(record);
    if (seen.has(key)) return;
    seen.add(key);
    records.push(record);
    sink(record);
}

/** Bind a reporter for one schema's unknown properties. */
export function unknownPropertyReporter(
    schemaVersion: string,
): (property: UnknownContractProperty) => void {
    return ({ key, path }) =>
        reportContractDrift({ kind: "unknown_property", schemaVersion, path, name: key });
}

export function reportUnknownEnumValue(schemaVersion: string, path: string, member: string): void {
    reportContractDrift({ kind: "unknown_enum_value", schemaVersion, path, name: member });
}

/** Everything observed this session, for tests and for a diagnostics surface. */
export function observedContractDrift(): readonly ContractDriftRecord[] {
    return records;
}

export function resetContractDrift(): void {
    seen.clear();
    records.length = 0;
    sink = defaultSink;
}
