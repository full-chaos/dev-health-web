import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { createRefund, getInvoices, getSubscription } from "../actions";
import { mockAuth } from "@/test/mocks/auth";

const HOSTILE =
    "[GraphQL] capacityForecast is served by query-api and has no Python implementation (cmd/query-api/query_route.go)";

const answer = (status: number) =>
    vi
        .spyOn(global, "fetch")
        .mockImplementation(
            async () => new Response(JSON.stringify({ detail: HOSTILE }), { status }),
        );

describe("billing server actions: failure text (CHAOS-8436)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    it("a failed read is the plain sentence for a 500 and for a 404", async () => {
        for (const status of [500, 404]) {
            mockAuth();
            const spy = answer(status);
            expect((await getInvoices()).error).toBe("Could not be read");
            expect((await getSubscription()).error).toBe("Could not be read");
            spy.mockRestore();
        }
    });

    it("a failed action hides the served text for a 5xx and a 403", async () => {
        for (const status of [500, 403]) {
            mockAuth();
            const spy = answer(status);
            const result = await createRefund({ invoice_id: "i1", reason: "x" } as never);
            expect(result.error).toBe("The change was not saved. Try again.");
            expect(JSON.stringify(result)).not.toContain("query-api");
            spy.mockRestore();
        }
    });

    it("a failed action keeps the served validation text for a 422", async () => {
        mockAuth();
        const spy = vi.spyOn(global, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Amount exceeds the invoice" }), {
                status: 422,
            }),
        );
        const result = await createRefund({ invoice_id: "i1", reason: "x" } as never);
        expect(result.error).toBe("Amount exceeds the invoice");
        spy.mockRestore();
    });
});
