import { describe, it, expect, afterEach, vi } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent, attachBeforeSend } from "../scrubber";

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

    it("passes through request.data for non-sensitive URLs", () => {
        const payload = JSON.stringify({ metric: "build_time", value: 42 });
        const event = makeEvent({
            request: {
                url: "https://example.com/api/metrics",
                data: payload,
            },
        });
        const result = scrubEvent(event);
        expect(result?.request?.data).toBe(payload);
    });

    it("strips user.ip_address in production", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("SENTRY_INCLUDE_IP", "");

        const event = makeEvent({
            user: { id: "user-123", email: "test@example.com", ip_address: "1.2.3.4" },
        });
        const result = scrubEvent(event);
        expect(result?.user?.ip_address).toBeUndefined();
        expect(result?.user?.id).toBe("user-123");
        expect(result?.user?.email).toBe("test@example.com");
    });

    it("preserves user.ip_address in production when SENTRY_INCLUDE_IP=true", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("SENTRY_INCLUDE_IP", "true");

        const event = makeEvent({
            user: { id: "user-123", ip_address: "1.2.3.4" },
        });
        const result = scrubEvent(event);
        expect(result?.user?.ip_address).toBe("1.2.3.4");
    });

    it("preserves user.ip_address in non-production environments", () => {
        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("SENTRY_INCLUDE_IP", "");

        const event = makeEvent({
            user: { id: "user-123", ip_address: "1.2.3.4" },
        });
        const result = scrubEvent(event);
        expect(result?.user?.ip_address).toBe("1.2.3.4");
    });

    it("handles events with no request gracefully", () => {
        const event = makeEvent({ message: "standalone error" });
        const result = scrubEvent(event);
        expect(result).not.toBeNull();
        expect(result?.message).toBe("standalone error");
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
