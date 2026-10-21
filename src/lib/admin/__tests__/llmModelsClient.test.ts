import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLLMModels, LLM_MODELS_PATH } from "../llmModelsClient";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchLLMModels", () => {
    it("is a browser GET through the web proxy with the abort signal, not a Server Action", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ models: [{ id: "gpt-4o" }], source: "live" }), {
                status: 200,
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const controller = new AbortController();

        const result = await fetchLLMModels(controller.signal);

        expect(LLM_MODELS_PATH).toBe("/api/v1/admin/llm-settings/models");
        expect(fetchMock).toHaveBeenCalledWith(
            LLM_MODELS_PATH,
            expect.objectContaining({ signal: controller.signal, cache: "no-store" }),
        );
        expect(result.data?.models).toEqual([{ id: "gpt-4o" }]);
    });

    it("asks for the chosen provider with a provider query param", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(new Response(JSON.stringify({ models: [], source: "catalog" })));
        vi.stubGlobal("fetch", fetchMock);

        await fetchLLMModels(new AbortController().signal, "anthropic");

        expect(fetchMock).toHaveBeenCalledWith(
            `${LLM_MODELS_PATH}?provider=anthropic`,
            expect.any(Object),
        );
    });

    it("answers an error and the status for a refused read, without the served body", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(new Response("provider said secret", { status: 502 })),
        );

        const result = await fetchLLMModels(new AbortController().signal);

        expect(result).toEqual({
            error: "The provider's model list is not available right now.",
            status: 502,
        });
    });

    it("rejects when the read is aborted, so the caller can drop it", async () => {
        const controller = new AbortController();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(
                (_url: string, init: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
                    }),
            ),
        );

        const pending = fetchLLMModels(controller.signal);
        controller.abort();

        await expect(pending).rejects.toThrow("aborted");
    });
});
