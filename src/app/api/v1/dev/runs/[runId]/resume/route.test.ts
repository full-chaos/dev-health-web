import { describe, expect, it, vi } from "vitest";

const { proxyDevRequestMock } = vi.hoisted(() => ({
    proxyDevRequestMock: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
}));

vi.mock("../../../_proxy", () => ({ proxyDevRequest: proxyDevRequestMock }));

import { POST } from "./route";

describe("POST /api/v1/dev/runs/:runId/resume", () => {
    it("proxies the encoded run as a streaming mutation", async () => {
        const request = new Request("https://app.example.test/api/v1/dev/runs/run%2F01/resume", {
            method: "POST",
            body: "{}",
        });

        await POST(request, { params: Promise.resolve({ runId: "run/01" }) });

        expect(proxyDevRequestMock).toHaveBeenCalledWith(
            request,
            "/api/v1/dev/runs/run%2F01/resume",
            { mutation: true, stream: true },
        );
    });
});
