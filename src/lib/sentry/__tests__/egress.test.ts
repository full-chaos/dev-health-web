import * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it } from "vitest";

import { attachBeforeSend } from "../scrubber";

const SECRET = "egress-secret-value";

function startSdk(sent: string[]) {
    Sentry.init(
        attachBeforeSend({
            dsn: "https://fake@example.invalid/1",
            tracesSampleRate: 1.0,
            transport: () => ({
                send: async (envelope: unknown) => {
                    sent.push(JSON.stringify(envelope));
                    return {};
                },
                flush: async () => true,
            }),
        }),
    );
}

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
});
