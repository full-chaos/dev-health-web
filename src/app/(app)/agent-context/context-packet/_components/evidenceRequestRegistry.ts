import type { ACRExpandedEvidenceV1 } from "@/lib/acr/generated";
import { isExpandedEvidence } from "./contextPacketResponse";

const MAX_CONCURRENT_EVIDENCE_REQUESTS = 8;

type QueueJob = () => void;

type EvidenceLease = {
    readonly promise: Promise<ACRExpandedEvidenceV1 | null>;
    readonly release: () => void;
};

type InFlightEvidence = {
    readonly controller: AbortController;
    readonly promise: Promise<ACRExpandedEvidenceV1 | null>;
    subscribers: number;
};

const cache = new Map<string, ACRExpandedEvidenceV1>();
const inFlight = new Map<string, InFlightEvidence>();
const queue: QueueJob[] = [];
let activeRequests = 0;

function cacheKey(repository: string, evidenceRefId: string): string {
    return `${repository}\u0000${evidenceRefId}`;
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
            activeRequests += 1;
            void fetch(
                `/api/agent-context/evidence/${encodeURIComponent(evidenceRefId)}?repository=${encodeURIComponent(repository)}`,
                { cache: "no-store", signal: controller.signal },
            )
                .then(async (response) => {
                    const value: unknown = await response.json();
                    return response.ok && isExpandedEvidence(value) ? value : null;
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

function createLease(repository: string, evidenceRefId: string): EvidenceLease {
    const key = cacheKey(repository, evidenceRefId);
    const cached = cache.get(key);
    if (cached) return { promise: Promise.resolve(cached), release: () => undefined };

    let request = inFlight.get(key);
    if (!request) {
        const controller = new AbortController();
        const promise = enqueueEvidenceRequest(repository, evidenceRefId, controller).then(
            (evidence) => {
                if (evidence) cache.set(key, evidence);
                return evidence;
            },
        );
        request = { controller, promise, subscribers: 0 };
        inFlight.set(key, request);
        void promise.finally(() => inFlight.delete(key));
    }
    request.subscribers += 1;
    let released = false;
    return {
        promise: request.promise,
        release: () => {
            if (released) return;
            released = true;
            request.subscribers -= 1;
            if (request.subscribers === 0) request.controller.abort();
        },
    };
}

export function requestEvidence(
    repository: string,
    evidenceRefId: string,
    signal: AbortSignal,
): EvidenceLease {
    const lease = createLease(repository, evidenceRefId);
    signal.addEventListener("abort", lease.release, { once: true });
    return lease;
}

export function resetEvidenceRequestRegistryForTests(): void {
    for (const request of inFlight.values()) request.controller.abort();
    cache.clear();
    inFlight.clear();
    queue.length = 0;
    activeRequests = 0;
}
