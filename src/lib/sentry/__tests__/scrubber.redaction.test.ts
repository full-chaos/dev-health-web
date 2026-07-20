import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";

import {
    attachBeforeSend,
    scrubBreadcrumb,
    scrubEvent,
    scrubReplayRecordingEvent,
    scrubTelemetryUrl,
} from "../scrubber";

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
    return { type: undefined, ...overrides } as ErrorEvent;
}

describe("Sentry credential redaction", () => {
    const secretPayload = {
        Client_Secret: "client-secret",
        API_TOKEN: "api-token",
        Access_Token: "access-token",
        REFRESH_TOKEN: "refresh-token",
        Authorization: "Bearer nested-token",
        Cookie: "session=nested-cookie",
        "X-CSRF-Token": "nested-csrf",
    };

    const redactedSecretPayload = Object.fromEntries(
        Object.keys(secretPayload).map((key) => [key, "[Filtered]"]),
    );

    it("filters every RequestEventData query_string shape without changing unrelated values", () => {
        const stringEvent = makeEvent({
            request: { query_string: "code=secret-code&state=secret-state&errorCount=2" },
        });
        const objectEvent = makeEvent({
            request: { query_string: { Code: "secret-code", STATE: "secret-state", page: "2" } },
        });
        const tupleEvent = makeEvent({
            request: {
                query_string: [
                    ["code", "secret-code"],
                    ["State", "secret-state"],
                    ["page", "2"],
                ],
            },
        });

        expect(scrubEvent(stringEvent)?.request?.query_string).toBe(
            "code=[Filtered]&state=[Filtered]&errorCount=2",
        );
        expect(scrubEvent(objectEvent)?.request?.query_string).toEqual({
            Code: "[Filtered]",
            STATE: "[Filtered]",
            page: "2",
        });
        expect(scrubEvent(tupleEvent)?.request?.query_string).toEqual([
            ["code", "[Filtered]"],
            ["State", "[Filtered]"],
            ["page", "2"],
        ]);
    });

    it("filters case-insensitive credential headers while preserving content-type", () => {
        const event = makeEvent({
            request: {
                headers: {
                    authorization: "Bearer lower",
                    Authorization: "Bearer title",
                    AUTHORIZATION: "Bearer upper",
                    cookie: "lower-cookie",
                    Cookie: "title-cookie",
                    COOKIE: "upper-cookie",
                    "x-csrf-token": "lower-csrf",
                    "X-CSRF-Token": "title-csrf",
                    "X-CSRF-TOKEN": "upper-csrf",
                    "content-type": "application/json",
                },
            },
        });

        expect(scrubEvent(event)?.request?.headers).toEqual({ "content-type": "application/json" });
    });

    it("filters OAuth keys in extra and contexts without filtering diagnostic error fields", () => {
        const result = scrubEvent(
            makeEvent({
                extra: {
                    oauth: { Code: "secret-code", STATE: "secret-state", error: "access_denied" },
                },
                contexts: {
                    oauth: { code: "secret-code", State: "secret-state", ERROR: "access_denied" },
                    app: { errorCount: 2, error: { message: "diagnostic error" } },
                },
            }),
        );

        expect(result?.extra).toEqual({
            oauth: { Code: "[Filtered]", STATE: "[Filtered]", error: "[Filtered]" },
        });
        expect(result?.contexts).toEqual({
            oauth: { code: "[Filtered]", State: "[Filtered]", ERROR: "[Filtered]" },
            app: { errorCount: 2, error: { message: "diagnostic error" } },
        });
    });

    it("filters nested credential fields case-insensitively in event payloads and preserves diagnostics", () => {
        const result = scrubEvent(
            makeEvent({
                extra: { action: { body: { ...secretPayload } } },
                contexts: { provider: { credentials: { ...secretPayload } } },
                request: {
                    url: "https://example.com/api/integrations",
                    data: { body: { ...secretPayload } },
                },
                tags: { state: "running", error: "timeout" },
            }),
        );

        expect((result?.extra?.action as { body: unknown }).body).toEqual(redactedSecretPayload);
        expect((result?.contexts?.provider as { credentials: unknown }).credentials).toEqual(
            redactedSecretPayload,
        );
        expect((result?.request?.data as { body: unknown }).body).toEqual(redactedSecretPayload);
        expect(result?.tags).toEqual({ state: "running", error: "timeout" });
    });

    it("filters nested credential fields in breadcrumbs, Replay, and transactions", async () => {
        const breadcrumb = scrubBreadcrumb({
            category: "fetch",
            data: { action: { body: { ...secretPayload } } },
        });
        const recordingEvent = scrubReplayRecordingEvent({
            type: 5,
            data: { action: { body: { ...secretPayload } } },
        });
        const config = attachBeforeSend({ dsn: "https://fake@sentry.io/1" });
        const transaction = await config.beforeSendTransaction!(
            {
                contexts: { action: { body: { ...secretPayload } } },
                transaction: "/org/admin/integrations",
                type: "transaction",
            } as never,
            { originalException: null, syntheticException: null },
        );

        expect((breadcrumb.data?.action as { body: unknown }).body).toEqual(redactedSecretPayload);
        expect((recordingEvent.data.action as { body: unknown }).body).toEqual(
            redactedSecretPayload,
        );
        if (transaction === null) throw new Error("Expected scrubbed transaction");
        expect((transaction.contexts?.action as { body: unknown }).body).toEqual(
            redactedSecretPayload,
        );
    });

    it("filters callback request state and error without erasing ordinary exception diagnostics", () => {
        const result = scrubEvent(
            makeEvent({
                request: {
                    url: "https://example.com/org/admin/integrations/pagerduty/callback",
                    data: { state: "callback-state", error: "access_denied" },
                },
                exception: {
                    values: [
                        {
                            type: "TimeoutError",
                            value: "Provider request timed out",
                            mechanism: { handled: true, type: "generic" },
                        },
                    ],
                },
                extra: { diagnostic: { state: "running", error: "timeout" } },
            }),
        );

        expect(result?.request?.data).toEqual({ state: "[Filtered]", error: "[Filtered]" });
        expect(result?.extra).toEqual({ diagnostic: { state: "running", error: "timeout" } });
        expect(result?.exception?.values?.[0]?.value).toBe("Provider request timed out");
    });

    it("filters OAuth keys in breadcrumb and Replay payload contexts", () => {
        const breadcrumb = scrubBreadcrumb({
            category: "navigation",
            data: { oauth: { code: "secret-code", State: "secret-state", error: "access_denied" } },
        });
        const recordingEvent = scrubReplayRecordingEvent({
            type: 5,
            data: { oauth: { CODE: "secret-code", state: "secret-state", Error: "access_denied" } },
        });

        expect(breadcrumb.data).toEqual({
            oauth: { code: "[Filtered]", State: "[Filtered]", error: "[Filtered]" },
        });
        expect(recordingEvent.data).toEqual({
            oauth: { CODE: "[Filtered]", state: "[Filtered]", Error: "[Filtered]" },
        });
    });

    it("filters OAuth keys in transaction contexts while preserving transaction source", async () => {
        const config = attachBeforeSend({ dsn: "https://fake@sentry.io/1" });
        const transaction = {
            contexts: {
                oauth: { code: "secret-code", STATE: "secret-state", error: "access_denied" },
            },
            transaction: "/org/admin/integrations/pagerduty/callback?code=secret-code",
            transaction_info: { source: "url" },
            type: "transaction",
        };
        const result = await config.beforeSendTransaction!(transaction as never, {
            originalException: null,
            syntheticException: null,
        });

        if (result === null) throw new Error("Expected scrubbed transaction");
        expect(result.contexts).toEqual({
            oauth: { code: "[Filtered]", STATE: "[Filtered]", error: "[Filtered]" },
        });
        expect(result.transaction).toBe("/org/admin/integrations/pagerduty/callback");
        expect(result.transaction_info).toEqual({ source: "url" });
    });

    it("filters token query parameters, fragments, and repeated encoding in raw URLs", () => {
        const rawUrl =
            "https://example.test/callback?access_token=access-secret&redirect=https%253A%252F%252Fexample.test%252Fdone%253Fapi_token%253Dnested-secret#refresh_token=fragment-secret";

        const scrubbed = scrubTelemetryUrl(rawUrl);

        expect(scrubbed).not.toContain("access-secret");
        expect(scrubbed).not.toContain("nested-secret");
        expect(scrubbed).not.toContain("fragment-secret");
        expect(scrubbed).not.toContain("#");
    });

    it("filters camelCase secret fields and binary values", () => {
        const binarySecret = new TextEncoder().encode("binary-secret");

        const result = scrubEvent(
            makeEvent({
                extra: {
                    clientSecret: "client-secret",
                    apiToken: "api-secret",
                    accessToken: "access-secret",
                    refreshToken: "refresh-secret",
                    binary: binarySecret,
                },
            }),
        );

        expect(result?.extra).toEqual({
            clientSecret: "[Filtered]",
            apiToken: "[Filtered]",
            accessToken: "[Filtered]",
            refreshToken: "[Filtered]",
            binary: "[Filtered]",
        });
    });

    it("fails closed for cyclic and over-depth telemetry payloads", () => {
        const cycle: Record<string, unknown> = {};
        cycle.self = cycle;
        let deep: Record<string, unknown> = { apiToken: "deep-secret" };
        for (let index = 0; index < 64; index += 1) deep = { next: deep };

        const result = scrubEvent(makeEvent({ extra: { cycle, deep } }));

        expect(result?.extra?.cycle).toEqual({ self: "[Filtered]" });
        expect(JSON.stringify(result)).not.toContain("deep-secret");
    });

    it("scrubs span attributes before forwarding to an existing span hook", () => {
        const config = attachBeforeSend({
            dsn: "https://fake@sentry.io/1",
            beforeSendSpan(span) {
                return { ...span, data: { ...span.data, hook: "called" } };
            },
        });
        const span = {
            data: {
                clientSecret: "client-secret",
                "http.request.body": { apiToken: "api-secret" },
                "url.full": "https://example.test/callback?access_token=url-secret",
            },
            description: "POST /callback?code=oauth-code",
        };

        const result = config.beforeSendSpan?.(span as never);

        expect(JSON.stringify(result)).not.toMatch(
            /client-secret|api-secret|url-secret|oauth-code/u,
        );
        expect(result?.data?.hook).toBe("called");
    });
});
