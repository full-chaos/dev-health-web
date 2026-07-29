import { describe, expect, it, vi } from "vitest";

const { proxyDevRequestMock } = vi.hoisted(() => ({
    proxyDevRequestMock: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
}));

vi.mock("../../../_proxy", () => ({ proxyDevRequest: proxyDevRequestMock }));

import { GET } from "./route";

describe("GET /api/v1/dev/conversations/:conversationId/transcript", () => {
    it("proxies only the bounded transcript pagination parameters", async () => {
        const request = new Request(
            "https://app.example.test/api/v1/dev/conversations/conversation%2F01/transcript?cursor=next%2Fpage&limit=25&unsafe=secret",
        );

        await GET(request, { params: Promise.resolve({ conversationId: "conversation/01" }) });

        expect(proxyDevRequestMock).toHaveBeenCalledWith(
            request,
            "/api/v1/dev/conversations/conversation%2F01/transcript?cursor=next%2Fpage&limit=25",
        );
    });
});
