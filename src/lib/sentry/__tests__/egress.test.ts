import * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it } from "vitest";

import { attachBeforeSend } from "../scrubber";

const SECRET = "egress-secret-value";

function startSdk(sent: string[], tweak?: (config: Sentry.NodeOptions) => Sentry.NodeOptions) {
    const config = attachBeforeSend({
        dsn: "https://fake@example.invalid/1",
        tracesSampleRate: 1.0,
        transport: () => ({
            send: async (envelope: unknown) => {
                sent.push(JSON.stringify(envelope));
                return {};
            },
            flush: async () => true,
        }),
    });
    Sentry.init(tweak ? tweak(config as Sentry.NodeOptions) : config);
}

const REQUEST = {
    url: "https://app.example.test/org/reports",
    method: "GET",
    headers: {
        cookie: "next-auth.session-token=egress-session-token",
        "x-forwarded-for": "203.0.113.77",
        "x-real-ip": "203.0.113.78",
        "user-agent": "vitest",
    },
    cookies: { "next-auth.session-token": "egress-session-token" },
};
const REQUEST_LEAKS = [/egress-session-token/u, /203\.0\.113\.7[78]/u];

describe("telemetry egress", () => {
    afterEach(async () => {
        await Sentry.close(100);
    });

    it("marks the span hook as static so the v10 scrub keeps running", () => {
        const config = attachBeforeSend({ dsn: "https://fake@example.invalid/1" });
        expect((config.beforeSendSpan as { _static?: boolean })._static).toBe(true);
        expect(config.traceLifecycle).toBe("static");
    });

    it("never sends scrubbed fields on an error event", async () => {
        const sent: string[] = [];
        startSdk(sent);

        Sentry.withScope((scope) => {
            scope.setExtra("clientSecret", SECRET);
            scope.setExtra("payload", { apiToken: SECRET });
            Sentry.captureException(new Error("boom"), {
                data: { password: SECRET },
            });
        });
        await Sentry.flush(1000);

        const out = sent.join("\n");
        expect(out).toContain("boom");
        expect(out).not.toContain(SECRET);
    });

    it("never sends scrubbed fields on a span or transaction", async () => {
        const sent: string[] = [];
        startSdk(sent);

        Sentry.startSpan(
            {
                name: "POST /callback?code=oauth-code",
                attributes: {
                    clientSecret: SECRET,
                    "url.full": `https://example.test/callback?access_token=${SECRET}`,
                },
            },
            () => {
                Sentry.startSpan(
                    { name: "child", attributes: { "http.request.body": `apiToken=${SECRET}` } },
                    () => undefined,
                );
            },
        );
        await Sentry.flush(1000);

        const out = sent.join("\n");
        expect(out).toContain("child");
        expect(out).not.toContain(SECRET);
        expect(out).not.toContain("oauth-code");
    });

    it("sends no cookies, session token or client IP from a real request on event or transaction", async () => {
        const sent: string[] = [];
        startSdk(sent);

        Sentry.withIsolationScope((scope) => {
            scope.setSDKProcessingMetadata({ normalizedRequest: REQUEST });
            Sentry.startSpan({ name: "GET /org/reports" }, () => {
                Sentry.captureException(new Error("request-boom"));
            });
        });
        await Sentry.flush(1000);

        const out = sent.join("\n");
        expect(out).toContain("request-boom");
        expect(out).toContain("/org/reports");
        for (const leak of REQUEST_LEAKS) expect(out).not.toMatch(leak);
    });

    it("runs the static span hook on its own, without the transaction scrub", async () => {
        const sent: string[] = [];
        startSdk(sent, (config) => ({ ...config, beforeSendTransaction: undefined }));

        Sentry.startSpan({ name: "parent" }, () => {
            Sentry.startSpan(
                { name: "child", attributes: { clientSecret: SECRET } },
                () => undefined,
            );
        });
        await Sentry.flush(1000);

        const out = sent.join("\n");
        expect(out).toContain("child");
        expect(out).not.toContain(SECRET);
    });
});
