import { describe, expect, it, vi } from "vitest";

import type { DevMessageRequest } from "../generated";
import { createDevApiClient } from "../client";

const request: DevMessageRequest = {
    schema_version: "dev_message_request.v1",
    client_message_id: "message_01",
    request_id: "request_01",
    conversation_id: "conversation_01",
    question: "What changed?",
    question_class: "investigation",
    scope: {
        schema_version: "dev_scope.v1",
        organization_id: "org_01",
        direct_scope: "organization",
        entity_refs: [],
        repositories: [],
        team_ids: [],
        time_range: {
            start: "2026-07-01T00:00:00Z",
            end: "2026-08-01T00:00:00Z",
            timezone: "UTC",
        },
        surface_context: null,
    },
};

describe("Ask Dev client contract declaration", () => {
    it("declares the pinned stream contract on every outgoing message request", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
            Response.json(
                {
                    schema_version: "dev_web_error.v1",
                    code: "upstream_unavailable",
                    safe_message: "Ask Dev is temporarily unavailable.",
                    retryable: true,
                },
                { status: 503 },
            ),
        );
        const client = createDevApiClient({ fetch: fetchMock });

        await expect(client.streamMessage("conversation_01", request)).rejects.toMatchObject({
            status: 503,
        });

        const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(body.client_contract_version).toBe("dev_stream_event.v1");
    });

    it("normalizes a legacy caller declaration to the pinned version", async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
            Response.json(
                {
                    schema_version: "dev_web_error.v1",
                    code: "upstream_unavailable",
                    safe_message: "Ask Dev is temporarily unavailable.",
                    retryable: true,
                },
                { status: 503 },
            ),
        );
        const client = createDevApiClient({ fetch: fetchMock });

        await expect(
            client.streamMessage("conversation_01", {
                ...request,
                client_contract_version: "dev_message_request.v1",
            }),
        ).rejects.toMatchObject({ status: 503 });

        const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
        expect(body.client_contract_version).toBe("dev_stream_event.v1");
    });
});
