import { beforeEach, describe, expect, it, vi } from "vitest";

import * as streamEnvelopeValidators from "@/lib/acr/streamEnvelopeValidators";
import * as streamValidators from "@/lib/acr/streamValidators";
import type { AcrAccessToken, AcrSilentOutcome } from "@/lib/ask-dev/acr-auth";
import type { AcrBrowserClientConfig } from "@/lib/ask-dev/acr-browser-config";

import { createAcrBrowserTransport } from "../browserTransport";

/**
 * CHAOS-12104 (T14a): web's own part of the browser's ACR transport, against a fake `fetch`.
 *
 * The transport itself is ask-dev's (`createAcrCalls`, pinned): its request, deadline, caps,
 * grammar, refusal, status, replay and 401 tests live in ask-dev's `src/acr-client/__tests__/`
 * (CHAOS-12613). What stays here is what web adds: its views of the result (`isResult`).
 */

const ISSUER = "https://acr.example.test";
const CONFIG: AcrBrowserClientConfig = {
    issuer: ISSUER,
    webOrigin: "https://web.example.test",
    clientId: "https://web.example.test/oauth/acr-client.json",
    redirectUri: "https://web.example.test/ask-dev/oauth/callback",
    usesMetadataDocument: true,
};
const TOKEN = "fcacr_test_token_0000000000000000000000000000000";
const T0 = 1_800_000_000_000;

let token: AcrAccessToken;
let fetchMock: ReturnType<typeof vi.fn>;
/** What the silent step answers; off, so a test here sees "authorization required" (CHAOS-12474). */
const authorizeAnswer = (): AcrSilentOutcome => ({ kind: "off" });

const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });

beforeEach(() => {
    token = { kind: "token", token: TOKEN, issuer: ISSUER };
    fetchMock = vi.fn();
});

describe("web's views of the result", () => {
    function transportWith(validators: () => Promise<typeof streamValidators>) {
        return createAcrBrowserTransport(CONFIG, {
            fetch: fetchMock as unknown as typeof fetch,
            now: () => T0,
            token: () => token,
            rejected: () => undefined,
            authorize: async () => authorizeAnswer(),
            envelope: streamEnvelopeValidators,
            validators,
        });
    }

    it("a result that passes the checks but that web's views cannot read is refused", async () => {
        const open = {
            ...streamValidators,
            validateInvestigationResultV1: () => true,
            validateInvestigationResultV2: () => true,
        };
        fetchMock.mockResolvedValue(jsonResponse({ status: "unread" }, 200));
        await expect(
            transportWith(async () => open).readResult("result_x", new AbortController().signal),
        ).rejects.toMatchObject({ reason: "invalid_upstream" });
    });
});
