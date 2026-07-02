import { describe, expect, it } from "vitest";
import {
    classifyProducer,
    isTerminalCustomerPushStatus,
    PRODUCER_BUCKET_LABELS,
} from "../producer";

describe("classifyProducer", () => {
    it("classifies dev-hops CLI producers", () => {
        expect(classifyProducer("dev-hops-cli")).toBe("cli");
        expect(classifyProducer("dev-hops-cli-0.12.0")).toBe("cli");
    });

    it("classifies CI producers", () => {
        expect(classifyProducer("github-actions")).toBe("ci");
        expect(classifyProducer("gitlab-ci")).toBe("ci");
        expect(classifyProducer("acme.ci.runner")).toBe("ci");
    });

    it("classifies relay producers", () => {
        expect(classifyProducer("relay-customer-owned")).toBe("relay");
    });

    it("falls through to api for anything else, including the cut web-console leg", () => {
        expect(classifyProducer("web-console")).toBe("api");
        expect(classifyProducer("some-custom-etl")).toBe("api");
    });

    it("treats a null producer (nullable on the real backend) as empty string", () => {
        expect(classifyProducer(null)).toBe("api");
    });

    it("has a label for every bucket", () => {
        for (const bucket of ["cli", "ci", "relay", "api"] as const) {
            expect(PRODUCER_BUCKET_LABELS[bucket]).toBeTruthy();
        }
    });
});

describe("isTerminalCustomerPushStatus", () => {
    it("treats completed/partial/failed as terminal", () => {
        expect(isTerminalCustomerPushStatus("completed")).toBe(true);
        expect(isTerminalCustomerPushStatus("partial")).toBe(true);
        expect(isTerminalCustomerPushStatus("failed")).toBe(true);
    });

    it("treats accepted/stream_unavailable/processing as non-terminal", () => {
        expect(isTerminalCustomerPushStatus("accepted")).toBe(false);
        expect(isTerminalCustomerPushStatus("stream_unavailable")).toBe(false);
        expect(isTerminalCustomerPushStatus("processing")).toBe(false);
    });
});
