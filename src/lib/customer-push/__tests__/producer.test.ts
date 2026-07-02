import { describe, expect, it } from "vitest";
import { classifyProducer, isTerminalCustomerPushStatus } from "../producer";

describe("classifyProducer", () => {
    it("classifies dev-hops CLI producers", () => {
        expect(classifyProducer("dev-hops-cli")).toBe("cli");
        expect(classifyProducer("dev-hops")).toBe("cli");
    });

    it("classifies CI producers", () => {
        expect(classifyProducer("github-actions")).toBe("ci");
        expect(classifyProducer("gitlab-ci")).toBe("ci");
        expect(classifyProducer("acme.ci.runner")).toBe("ci");
    });

    it("classifies relay producers", () => {
        expect(classifyProducer("customer-relay")).toBe("relay");
    });

    it("falls through unrecognized producers — including the cut web-console leg — to api", () => {
        expect(classifyProducer("web-console")).toBe("api");
        expect(classifyProducer("some-custom-etl")).toBe("api");
    });

    it("is case-insensitive", () => {
        expect(classifyProducer("DEV-HOPS-CLI")).toBe("cli");
    });
});

describe("isTerminalCustomerPushStatus", () => {
    it("treats completed, partial, and failed as terminal", () => {
        expect(isTerminalCustomerPushStatus("completed")).toBe(true);
        expect(isTerminalCustomerPushStatus("partial")).toBe(true);
        expect(isTerminalCustomerPushStatus("failed")).toBe(true);
    });

    it("treats accepted, stream_unavailable, and processing as non-terminal", () => {
        expect(isTerminalCustomerPushStatus("accepted")).toBe(false);
        expect(isTerminalCustomerPushStatus("stream_unavailable")).toBe(false);
        expect(isTerminalCustomerPushStatus("processing")).toBe(false);
    });
});
