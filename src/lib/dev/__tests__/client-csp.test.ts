import { afterEach, describe, expect, it, vi } from "vitest";

describe("Ask Dev browser validation under strict CSP", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it("imports and validates without eval or Function code generation", async () => {
        const blockedCodeGeneration = vi.fn(() => {
            throw new Error("CSP blocked runtime code generation");
        });
        const blockedFunction = new Proxy(globalThis.Function, {
            apply: blockedCodeGeneration,
            construct: blockedCodeGeneration,
        });
        vi.stubGlobal("Function", blockedFunction);
        vi.stubGlobal("eval", blockedCodeGeneration);
        vi.resetModules();

        const { createDevApiClient } = await import("../client");
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json({
                    schema_version: "dev_capabilities.v1",
                    ask_dev: true,
                    can_read: true,
                    readiness: "ready",
                }),
            )
            .mockResolvedValueOnce(Response.json({}));
        const client = createDevApiClient({ fetch: fetchMock });

        await expect(client.getCapabilities()).resolves.toMatchObject({
            ask_dev: true,
            can_read: true,
            readiness: "ready",
        });
        await expect(client.listConversations()).rejects.toMatchObject({
            name: "DevApiError",
            detail: { code: "invalid_response" },
        });
        expect(blockedCodeGeneration).not.toHaveBeenCalled();
    });
});
