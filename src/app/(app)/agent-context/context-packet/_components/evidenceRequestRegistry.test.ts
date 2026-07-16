import { afterEach, describe, expect, it, vi } from "vitest";
import type { ACRExpandedEvidenceV1 } from "@/lib/acr/generated";
import { SAMPLE_EXPANDED_EVIDENCE } from "./samplePacket";
import { requestEvidence, resetEvidenceRequestRegistryForTests } from "./evidenceRequestRegistry";

type DeferredResponse = {
    readonly promise: Promise<Response>;
    readonly reject: (error: Error) => void;
    readonly resolve: (response: Response) => void;
};

function deferredResponse(): DeferredResponse {
    let resolveResponse: ((response: Response) => void) | undefined;
    let rejectResponse: ((error: Error) => void) | undefined;
    const promise = new Promise<Response>((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
    });

    return {
        promise,
        reject: (error) => {
            if (rejectResponse === undefined) throw new Error("Deferred response is not ready.");
            rejectResponse(error);
        },
        resolve: (response) => {
            if (resolveResponse === undefined) throw new Error("Deferred response is not ready.");
            resolveResponse(response);
        },
    };
}

function evidence(label: string): ACRExpandedEvidenceV1 {
    const source = SAMPLE_EXPANDED_EVIDENCE.ev_01J0ACR001;
    return {
        ...source,
        evidence: {
            ...source.evidence,
            source: { ...source.evidence.source, display_label: label },
        },
    };
}

function jsonResponse(value: ACRExpandedEvidenceV1): Response {
    return new Response(JSON.stringify(value), { status: 200 });
}

afterEach(() => {
    resetEvidenceRequestRegistryForTests();
    vi.restoreAllMocks();
});

describe("evidence request registry", () => {
    it("starts a fresh generation when a replacement packet reuses an aborted evidence key", async () => {
        const staleResponse = deferredResponse();
        const freshResponse = deferredResponse();
        const responses = [staleResponse, freshResponse];
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
            const response = responses.shift();
            if (response === undefined)
                return Promise.reject(new Error("Unexpected evidence request."));
            return response.promise;
        });
        const firstSubscriber = new AbortController();

        const staleLease = requestEvidence({
            evidenceRefId: "ev_01J0ACR001",
            packetIdentity: "packet-replaced",
            repository: "full-chaos/dev-health-acr",
            signal: firstSubscriber.signal,
        });
        firstSubscriber.abort();

        const freshLease = requestEvidence({
            evidenceRefId: "ev_01J0ACR001",
            packetIdentity: "packet-replacement",
            repository: "full-chaos/dev-health-acr",
            signal: new AbortController().signal,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);

        staleResponse.resolve(jsonResponse(evidence("Stale evidence")));
        await expect(staleLease.promise).resolves.toMatchObject({
            evidence: { source: { display_label: "Stale evidence" } },
        });

        const concurrentLease = requestEvidence({
            evidenceRefId: "ev_01J0ACR001",
            packetIdentity: "packet-replacement",
            repository: "full-chaos/dev-health-acr",
            signal: new AbortController().signal,
        });
        expect(concurrentLease.promise).toBe(freshLease.promise);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        freshResponse.resolve(jsonResponse(evidence("Fresh evidence")));
        await expect(freshLease.promise).resolves.toMatchObject({
            evidence: { source: { display_label: "Fresh evidence" } },
        });
    });

    it("keeps a fresh generation shareable after an aborted generation rejects", async () => {
        const staleResponse = deferredResponse();
        const freshResponse = deferredResponse();
        const responses = [staleResponse, freshResponse];
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
            const response = responses.shift();
            if (response === undefined)
                return Promise.reject(new Error("Unexpected evidence request."));
            return response.promise;
        });
        const firstSubscriber = new AbortController();

        const staleLease = requestEvidence({
            evidenceRefId: "ev_01J0ACR001",
            packetIdentity: "packet-retry",
            repository: "full-chaos/dev-health-acr",
            signal: firstSubscriber.signal,
        });
        firstSubscriber.abort();

        const freshLease = requestEvidence({
            evidenceRefId: "ev_01J0ACR001",
            packetIdentity: "packet-retry",
            repository: "full-chaos/dev-health-acr",
            signal: new AbortController().signal,
        });

        staleResponse.reject(new Error("Aborted stale generation."));
        await expect(staleLease.promise).resolves.toBeNull();

        const concurrentLease = requestEvidence({
            evidenceRefId: "ev_01J0ACR001",
            packetIdentity: "packet-retry",
            repository: "full-chaos/dev-health-acr",
            signal: new AbortController().signal,
        });
        expect(concurrentLease.promise).toBe(freshLease.promise);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        freshResponse.resolve(jsonResponse(evidence("Fresh evidence")));
        await expect(freshLease.promise).resolves.toMatchObject({
            evidence: { source: { display_label: "Fresh evidence" } },
        });
    });
});
