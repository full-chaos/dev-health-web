import contextPacket from "../../src/lib/acr/contracts/examples/context_packet.v1.json";
import expandedEvidence from "../../src/lib/acr/contracts/examples/expanded_evidence.v1.json";

type AcrMockControls = {
    readonly delayedGoals: Readonly<Record<string, number>>;
    readonly evidenceDelayMs: number;
    readonly evidenceReferenceCount: number;
    readonly malformedPacket: boolean;
    readonly pausedGoals: readonly string[];
};

type AcrMockEvidenceStats = {
    readonly active: number;
    readonly count: number;
    readonly maxConcurrent: number;
};

const DEFAULT_CONTROLS: AcrMockControls = {
    delayedGoals: {},
    evidenceDelayMs: 0,
    evidenceReferenceCount: 1,
    malformedPacket: false,
    pausedGoals: [],
};
const MAX_CONTROLLED_DELAY_MS = 60_000;
const MAX_EVIDENCE_REFERENCES = 32;

let controls = DEFAULT_CONTROLS;
let evidenceStats: AcrMockEvidenceStats = { active: 0, count: 0, maxConcurrent: 0 };
const pausedContextPacketWaiters = new Map<string, Set<() => void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDelay(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= MAX_CONTROLLED_DELAY_MS
    );
}

function parseDelayedGoals(value: unknown): Readonly<Record<string, number>> | null {
    if (value === undefined) return {};
    if (!isRecord(value)) return null;
    const delayedGoals: Record<string, number> = {};
    for (const [goal, delay] of Object.entries(value)) {
        if (goal.length === 0 || goal.length > 200 || !isDelay(delay)) return null;
        delayedGoals[goal] = delay;
    }
    return delayedGoals;
}

function parsePausedGoals(value: unknown): readonly string[] | null {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return null;
    if (
        value.some((goal) => typeof goal !== "string" || goal.length === 0 || goal.length > 200) ||
        new Set(value).size !== value.length
    )
        return null;
    return value;
}

function packetStatus(goal: string): "complete" | "degraded" | "empty" | "partial" {
    switch (goal) {
        case "e2e empty":
            return "empty";
        case "e2e degraded":
            return "degraded";
        case "e2e partial":
            return "partial";
        default:
            return "complete";
    }
}

function evidenceItems(evidenceReferenceCount: number) {
    const baseItem = contextPacket.items[0];
    if (baseItem === undefined)
        throw new Error("The ACR packet fixture requires one evidence item.");
    const evidenceRefIds = Array.from(
        { length: evidenceReferenceCount },
        (_, index) => `ev_e2e_${String(index + 1).padStart(2, "0")}`,
    );
    const splitAt = Math.ceil(evidenceRefIds.length / 2);
    return [evidenceRefIds.slice(0, splitAt), evidenceRefIds.slice(splitAt)]
        .filter((references) => references.length > 0)
        .map((references, index) => ({
            ...baseItem,
            evidence_ref_ids: references,
            packet_item_id: `${baseItem.packet_item_id}-${index + 1}`,
            title: `${baseItem.title} ${index + 1}`,
        }));
}

export function contextPacketForGoal(goal: string) {
    const status = packetStatus(goal);
    const packet = {
        ...contextPacket,
        context_packet_id: `e2e-${status}-${goal}`,
        goal,
        items: status === "empty" ? [] : evidenceItems(controls.evidenceReferenceCount),
        status,
    };
    if (!controls.malformedPacket) return packet;
    return { ...packet, freshness: { ...packet.freshness, watermarks: null } };
}

export function expandedEvidenceForId(evidenceRefId: string) {
    return {
        ...expandedEvidence,
        evidence: { ...expandedEvidence.evidence, evidence_ref_id: evidenceRefId },
    };
}

export function getContextPacketDelay(goal: string): number {
    return controls.delayedGoals[goal] ?? 0;
}

export function waitForContextPacketRelease(goal: string): Promise<void> | null {
    if (!controls.pausedGoals.includes(goal)) return null;
    return new Promise((resolve) => {
        const waiter = () => {
            const waiters = pausedContextPacketWaiters.get(goal);
            waiters?.delete(waiter);
            if (waiters?.size === 0) pausedContextPacketWaiters.delete(goal);
            resolve();
        };
        const waiters = pausedContextPacketWaiters.get(goal) ?? new Set<() => void>();
        waiters.add(waiter);
        pausedContextPacketWaiters.set(goal, waiters);
    });
}

export function pausedContextPacketGoals(): readonly string[] {
    return [...pausedContextPacketWaiters.keys()].sort((left, right) => left.localeCompare(right));
}

export function releasePausedContextPackets(goal: string): boolean {
    const waiters = pausedContextPacketWaiters.get(goal);
    if (waiters === undefined) return false;
    for (const waiter of [...waiters]) waiter();
    return true;
}

function releaseAllPausedContextPackets(): void {
    for (const goal of pausedContextPacketGoals()) releasePausedContextPackets(goal);
}

export function getEvidenceDelay(): number {
    return controls.evidenceDelayMs;
}

export function evidenceRequestStarted(): () => void {
    evidenceStats = {
        active: evidenceStats.active + 1,
        count: evidenceStats.count + 1,
        maxConcurrent: Math.max(evidenceStats.maxConcurrent, evidenceStats.active + 1),
    };
    let finished = false;
    return () => {
        if (finished) return;
        finished = true;
        evidenceStats = { ...evidenceStats, active: evidenceStats.active - 1 };
    };
}

export function getAcrMockEvidenceStats(): AcrMockEvidenceStats {
    return evidenceStats;
}

export function setAcrMockControls(input: unknown): boolean {
    if (!isRecord(input)) return false;
    const allowedKeys = new Set([
        "delayedGoals",
        "evidenceDelayMs",
        "evidenceReferenceCount",
        "malformedPacket",
        "pausedGoals",
    ]);
    if (Object.keys(input).some((key) => !allowedKeys.has(key))) return false;
    if (input.malformedPacket !== undefined && typeof input.malformedPacket !== "boolean")
        return false;
    if (input.evidenceDelayMs !== undefined && !isDelay(input.evidenceDelayMs)) return false;
    if (
        input.evidenceReferenceCount !== undefined &&
        (!Number.isInteger(input.evidenceReferenceCount) ||
            typeof input.evidenceReferenceCount !== "number" ||
            input.evidenceReferenceCount < 1 ||
            input.evidenceReferenceCount > MAX_EVIDENCE_REFERENCES)
    )
        return false;
    const delayedGoals = parseDelayedGoals(input.delayedGoals);
    if (delayedGoals === null) return false;
    const pausedGoals = parsePausedGoals(input.pausedGoals);
    if (pausedGoals === null) return false;
    releaseAllPausedContextPackets();
    controls = {
        delayedGoals,
        evidenceDelayMs: input.evidenceDelayMs ?? 0,
        evidenceReferenceCount: input.evidenceReferenceCount ?? 1,
        malformedPacket: input.malformedPacket ?? false,
        pausedGoals,
    };
    evidenceStats = { active: 0, count: 0, maxConcurrent: 0 };
    return true;
}

export function resetAcrMockControls(): void {
    releaseAllPausedContextPackets();
    controls = DEFAULT_CONTROLS;
    evidenceStats = { active: 0, count: 0, maxConcurrent: 0 };
}
