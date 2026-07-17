import type { ACRExpandedEvidenceV1 } from "@/lib/acr/generated";
import { isExpandedEvidence } from "./contextPacketResponse";

const MAX_CONCURRENT_EVIDENCE_REQUESTS = 8;

type QueueJob = () => void;

type EvidenceLease = {
    readonly promise: Promise<ACRExpandedEvidenceV1 | null>;
    readonly release: () => void;
};

type EvidenceRequestInput = {
    readonly evidenceRefId: string;
    readonly packetIdentity: string;
    readonly repository: string;
    readonly signal: AbortSignal;
};

type InFlightEvidence = {
    readonly controller: AbortController;
    readonly generation: symbol;
    readonly promise: Promise<ACRExpandedEvidenceV1 | null>;
    subscribers: number;
};

const cache = new Map<string, ACRExpandedEvidenceV1>();
const inFlight = new Map<string, InFlightEvidence>();
const queue: QueueJob[] = [];
let activeRequests = 0;

function cacheKey(packetIdentity: string, repository: string, evidenceRefId: string): string {
    return `${packetIdentity}\u0000${repository}\u0000${evidenceRefId}`;
}

function startNextRequest(): void {
    if (activeRequests >= MAX_CONCURRENT_EVIDENCE_REQUESTS) return;
    const job = queue.shift();
    if (job) job();
}

function enqueueEvidenceRequest(
    repository: string,
    evidenceRefId: string,
    controller: AbortController,
): Promise<ACRExpandedEvidenceV1 | null> {
    return new Promise((resolve) => {
        const run = () => {
            if (controller.signal.aborted) {
                resolve(null);
                startNextRequest();
                return;
            }
            activeRequests += 1;
            void fetch(
                `/api/agent-context/evidence/${encodeURIComponent(evidenceRefId)}?repository=${encodeURIComponent(repository)}`,
                { cache: "no-store", signal: controller.signal },
            )
                .then(async (response) => {
                    const value: unknown = await response.json();
                    return response.ok &&
                        isExpandedEvidence(value) &&
                        value.evidence.evidence_ref_id === evidenceRefId
                        ? value
                        : null;
                })
                .then(resolve, () => resolve(null))
                .finally(() => {
                    activeRequests -= 1;
                    startNextRequest();
                });
        };
        queue.push(run);
        startNextRequest();
    });
}

function createLease({
    evidenceRefId,
    packetIdentity,
    repository,
}: Omit<EvidenceRequestInput, "signal">): EvidenceLease {
    const key = cacheKey(packetIdentity, repository, evidenceRefId);
    const cached = cache.get(key);
    if (cached) return { promise: Promise.resolve(cached), release: () => undefined };

    let request = inFlight.get(key);
    if (!request) {
        const controller = new AbortController();
        const generation = Symbol(key);
        const promise = enqueueEvidenceRequest(repository, evidenceRefId, controller).then(
            (evidence) => {
                if (
                    evidence &&
                    inFlight.get(key)?.generation === generation &&
                    !controller.signal.aborted
                ) {
                    cache.set(key, evidence);
                }
                return evidence;
            },
        );
        request = { controller, generation, promise, subscribers: 0 };
        inFlight.set(key, request);
        void promise.finally(() => {
            if (inFlight.get(key)?.generation === generation) inFlight.delete(key);
        });
    }
    request.subscribers += 1;
    let released = false;
    return {
        promise: request.promise,
        release: () => {
            if (released) return;
            released = true;
            request.subscribers -= 1;
            if (request.subscribers === 0) {
                if (inFlight.get(key)?.generation === request.generation) inFlight.delete(key);
                request.controller.abort();
            }
        },
    };
}

export function requestEvidence(input: EvidenceRequestInput): EvidenceLease {
    if (input.signal.aborted) return { promise: Promise.resolve(null), release: () => undefined };
    const lease = createLease(input);
    input.signal.addEventListener("abort", lease.release, { once: true });
    return lease;
}

export function resetEvidenceRequestRegistryForTests(): void {
    for (const request of inFlight.values()) request.controller.abort();
    cache.clear();
    inFlight.clear();
    queue.length = 0;
    activeRequests = 0;
}
