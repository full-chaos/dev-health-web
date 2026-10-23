import { describe, it, expect, afterEach, vi } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import {
    attachBeforeSend,
    scrubBreadcrumb,
    scrubEvent,
    scrubReplayRecordingEvent,
} from "../scrubber";

// Helpers
function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
    return {
        type: undefined,
        ...overrides,
    } as ErrorEvent;
}

describe("scrubEvent", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("removes request.cookies", () => {
        const event = makeEvent({
            request: {
                url: "https://example.com/api/data",
                cookies: { session: "abc123", csrf: "xyz" },
            },
        });
        const result = scrubEvent(event);
        expect(result?.request?.cookies).toBeUndefined();
    });

    it("removes Authorization header (case-sensitive key)", () => {
        const event = makeEvent({
            request: {
                url: "https://example.com/api/data",
                headers: {
                    authorization: "Bearer secret-token",
                    "content-type": "application/json",
                },
            },
        });
        const result = scrubEvent(event);
        expect(result?.request?.headers).not.toHaveProperty("authorization");
        expect(result?.request?.headers).toHaveProperty("content-type");
    });

    it("removes x-csrf-token header", () => {
        const event = makeEvent({
            request: {
                url: "https://example.com/api/data",
                headers: {
                    "x-csrf-token": "csrf-secret",
                    "content-type": "application/json",
                },
            },
        });
        const result = scrubEvent(event);
        expect(result?.request?.headers).not.toHaveProperty("x-csrf-token");
        expect(result?.request?.headers).toHaveProperty("content-type");
    });

    it("drops request.data for /api/v1/auth URL", () => {
        const event = makeEvent({
            request: {
                url: "https://example.com/api/v1/auth",
                data: JSON.stringify({ username: "admin", password: "secret" }),
            },
        });
        const result = scrubEvent(event);
        expect(result?.request?.data).toBeUndefined();
    });

    it("drops request.data for /org/admin/credentials URL", () => {
        const event = makeEvent({
            request: {
                url: "https://example.com/org/admin/credentials",
                data: JSON.stringify({ apiKey: "supersecret" }),
            },
        });
        const result = scrubEvent(event);
        expect(result?.request?.data).toBeUndefined();
    });

    it("scrubs request.data for non-sensitive URLs", () => {
        const payload = { metric: "build_time", value: 42, apiToken: "secret-token" };
        const event = makeEvent({
            request: {
                url: "https://example.com/api/metrics",
                data: payload,
            },
        });
        const result = scrubEvent(event);
        expect(result?.request?.data).toEqual({
            metric: "build_time",
            value: 42,
            apiToken: "[Filtered]",
        });
    });

    // D6247 (user ID only, no PII): these three tests used to pin e-mail and IP kept on purpose
    // in some environments. They now pin the opposite, on purpose, in every environment.
    it.each([
        ["production", ""],
        ["production", "true"],
        ["development", ""],
        ["test", "true"],
    ])("keeps user.id only on an event: NODE_ENV=%s SENTRY_INCLUDE_IP=%s", (nodeEnv, includeIp) => {
        vi.stubEnv("NODE_ENV", nodeEnv);
        vi.stubEnv("SENTRY_INCLUDE_IP", includeIp);

        const event = makeEvent({
            user: {
                id: "user-123",
                email: "test@example.com",
                username: "sample-name",
                ip_address: "{{auto}}",
                segment: "sample",
            } as ErrorEvent["user"],
        });
        const result = scrubEvent(event);
        expect(result?.user).toEqual({ id: "user-123" });
        expect(JSON.stringify(result)).not.toContain("{{auto}}");
    });

    it("drops a user with no id to an empty user", () => {
        const event = makeEvent({ user: { email: "test@example.com", ip_address: "1.2.3.4" } });
        expect(scrubEvent(event)?.user).toEqual({});
    });

    it("leaves an event with no user without a user", () => {
        expect(scrubEvent(makeEvent({ message: "x" }))).not.toHaveProperty("user");
    });

    it("handles events with no request gracefully", () => {
        const event = makeEvent({ message: "standalone error" });
        const result = scrubEvent(event);
        expect(result).not.toBeNull();
        expect(result?.message).toBe("standalone error");
    });

    it("removes OAuth query values from event URLs and provider callback breadcrumbs", () => {
        const event = makeEvent({
            request: {
                url: "https://app.example.test/org/admin/integrations/pagerduty/callback?code=secret-code&state=secret-state&error=access_denied",
            },
        });

        const result = scrubEvent(event);
        expect(result?.request?.url).toBe(
            "https://app.example.test/org/admin/integrations/pagerduty/callback",
        );

        const breadcrumb = scrubBreadcrumb({
            category: "navigation",
            data: {
                to: "/org/admin/integrations/github-app/callback?installation_id=123&state=signed-state",
            },
        });
        expect(breadcrumb.data?.to).toBe("/org/admin/integrations/github-app/callback");
    });

    it("removes OAuth query values from Replay recording events", () => {
        const recordingEvent = scrubReplayRecordingEvent({
            data: {
                url: "https://app.example.test/org/admin/integrations/pagerduty/callback?code=secret-code&state=secret-state",
            },
            type: 5,
        });

        expect(recordingEvent.data.url).toBe(
            "https://app.example.test/org/admin/integrations/pagerduty/callback",
        );
    });
});

describe("attachBeforeSend", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("returns a config object with beforeSend set", () => {
        const config = attachBeforeSend({ dsn: "https://fake@sentry.io/1" });
        expect(typeof config.beforeSend).toBe("function");
    });

    it("applies scrubbing when beforeSend is invoked", () => {
        const config = attachBeforeSend({ dsn: "https://fake@sentry.io/1" });
        const event = makeEvent({
            request: {
                url: "https://example.com/api/data",
                cookies: { session: "secret" },
            },
        });
        const result = config.beforeSend!(event, {
            originalException: null,
            syntheticException: null,
        }) as ErrorEvent | null;
        expect(result?.request?.cookies).toBeUndefined();
    });

    it("chains existing beforeSend if provided", () => {
        const marker = { touched: false };
        const config = attachBeforeSend({
            dsn: "https://fake@sentry.io/1",
            beforeSend(ev) {
                marker.touched = true;
                return ev;
            },
        });
        const event = makeEvent({ message: "hello" });
        config.beforeSend!(event, { originalException: null, syntheticException: null });
        expect(marker.touched).toBe(true);
    });

    it("skips existing beforeSend when scrubEvent returns null", () => {
        // scrubEvent currently never returns null, but test the chain contract
        // by monkey-patching: we supply a beforeSend that would set marker
        // and verify flow. Since scrubEvent won't return null for a basic event,
        // we just verify the result passes through.
        const config = attachBeforeSend({
            dsn: "https://fake@sentry.io/1",
            beforeSend(ev) {
                return { ...ev, tags: { chained: "yes" } };
            },
        });
        const event = makeEvent({ message: "hi" });
        const result = config.beforeSend!(event, {
            originalException: null,
            syntheticException: null,
        }) as ErrorEvent | null;
        expect(result?.tags?.chained).toBe("yes");
    });
});

// D6247 (user ID only, no PII): user data that rides on other fields is dropped the same way as the user
// object. `user.id` is the only user key that stays; `enduser.*` goes entirely.
describe("user keys on other event fields", () => {
    const email = ["field-user", "example.test"].join("@");
    const userKeys = () => ({
        "user.id": "u1",
        "user.email": email,
        "user.name": "n",
        "user.ip_address": "1.2.3.4",
        user_email: email,
        "enduser.id": "e1",
        "enduser.pseudo_id": "e2",
        keep: "k",
    });
    const only = (record: unknown) => Object.keys(record as object).sort();

    it("drops them from span attributes", () => {
        const config = attachBeforeSend({});
        const span = config.beforeSendSpan?.({
            data: userKeys(),
            description: "d",
        } as never) as unknown as {
            data: Record<string, unknown>;
        };
        expect(only(span.data)).toEqual(["keep", "user.id"]);
    });

    it("drops them from tags, extra and the root span data of an event and a transaction", () => {
        const config = attachBeforeSend({});
        const make = () =>
            ({
                tags: userKeys(),
                extra: userKeys(),
                contexts: { trace: { data: userKeys() } },
                spans: [{ data: userKeys() }],
            }) as never;
        for (const out of [
            config.beforeSend?.(make(), {}),
            config.beforeSendTransaction?.(make(), {}),
        ] as Array<{
            tags: object;
            extra: object;
            contexts: { trace: { data: object } };
            spans: Array<{ data: object }>;
        }>) {
            expect(only(out.tags)).toEqual(["keep", "user.id"]);
            expect(only(out.extra)).toEqual(["keep", "user.id"]);
            expect(only(out.contexts.trace.data)).toEqual(["keep", "user.id"]);
            expect(only(out.spans[0].data)).toEqual(["keep", "user.id"]);
        }
    });

    it("cuts the user and enduser contexts: user keeps the id, enduser goes", () => {
        const config = attachBeforeSend({});
        const out = config.beforeSend?.(
            {
                contexts: {
                    user: { id: "u1", email, name: "n" },
                    enduser: { id: "e1", email },
                    other: { note: "x" },
                },
            } as never,
            {},
        ) as { contexts: Record<string, unknown> };
        expect(out.contexts.user).toEqual({ id: "u1" });
        expect(out.contexts).not.toHaveProperty("enduser");
        expect(out.contexts.other).toEqual({ note: "x" });
    });

    it("drops them from breadcrumb data, in the hook and inside an event", () => {
        const config = attachBeforeSend({});
        const crumb = config.beforeBreadcrumb?.({
            message: "m",
            data: { ...userKeys(), user: { id: "u1", email } },
        } as never) as { data: Record<string, unknown> };
        expect(only(crumb.data)).toEqual(["keep", "user", "user.id"]);
        expect(crumb.data.user).toEqual({ id: "u1" });

        const out = config.beforeSend?.(
            { breadcrumbs: [{ message: "m", data: userKeys() }] } as never,
            {},
        ) as { breadcrumbs: Array<{ data: object }> };
        expect(only(out.breadcrumbs[0].data)).toEqual(["keep", "user.id"]);
    });
});
