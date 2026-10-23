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

    // D6247 (user ID only, no PII): the user set on any scope reaches the wire as `id` and nothing else.
    // Values are joined at run time: the SDK sends source lines around a stack frame, so a literal in
    // this file would show up in the envelope.
    it("sends user.id only on an error event and a transaction, with no e-mail, IP or auto marker", async () => {
        const sent: string[] = [];
        startSdk(sent);
        const email = ["egress-user", "example.test"].join("@");
        const name = ["egress", "name"].join("-");
        const ipKey = ["ip", "address"].join("_");
        const auto = ["{{", "auto", "}}"].join("");

        Sentry.withIsolationScope((scope) => {
            scope.setUser({ id: "user-id-1", email, username: name, [ipKey]: auto });
            scope.setSDKProcessingMetadata({ normalizedRequest: REQUEST });
            Sentry.startSpan({ name: "GET /org/reports" }, () => {
                Sentry.captureException(new Error("user-boom"));
            });
        });
        await Sentry.flush(1000);

        const items = sent
            .flatMap((envelope) => (JSON.parse(envelope) as [unknown, unknown[][]])[1])
            .map((item) => item[1] as { user?: unknown; type?: string });
        const kinds = items.map((item) => (item.type === "transaction" ? "transaction" : "event"));
        expect(kinds).toEqual(expect.arrayContaining(["transaction", "event"]));
        for (const item of items) expect(item.user).toEqual({ id: "user-id-1" });
        const out = sent.join("\n");
        expect(out).toContain("user-boom");
        expect(out).not.toContain(name);
        expect(out).not.toContain(auto);
        expect(out).not.toMatch(/203\.0\.113\.7[78]/u);
    });

    it("sends the user through the current scope and the global scope as id only", async () => {
        const sent: string[] = [];
        startSdk(sent);

        const email = (who: string) => [`${who}-user`, "example.test"].join("@");
        Sentry.setUser({ id: "global-id", email: email("global") });
        Sentry.getCurrentScope().setUser({ id: "current-id", email: email("current") });
        Sentry.captureException(new Error("scope-boom"));
        await Sentry.flush(1000);

        const out = sent.join("\n");
        expect(out).toContain("scope-boom");
        expect(out).not.toContain(email("global"));
        expect(out).not.toContain(email("current"));
    });

    it("sets no sendDefaultPii and keeps user info collection off in every init", () => {
        const config = attachBeforeSend({ dsn: "https://fake@example.invalid/1" });
        expect((config as Record<string, unknown>).sendDefaultPii).not.toBe(true);
        expect(config.dataCollection?.userInfo).toBe(false);
    });

    it.each([
        ["an encoded address in the request url", (a: string) => `https://app.example/u/${a}/x`],
        ["an address with a numeric first label", (a: string) => `https://app.example/u/${a}/x`],
    ])("sends no address from %s", async (name, build) => {
        const sent: string[] = [];
        startSdk(sent);
        const encoded = name.startsWith("an encoded");
        // Joined at run time: the SDK sends source lines around a stack frame.
        const local = ["alice", "egress"].join("-");
        const text = encoded
            ? `${local}%40${["mail", "example"].join("%2E")}`
            : `${local}@${["123", "mail", "example", "com"].join(".")}`;

        Sentry.withIsolationScope((scope) => {
            scope.setSDKProcessingMetadata({
                normalizedRequest: { url: build(text), method: "GET", headers: {} },
            });
            Sentry.captureException(new Error("address-boom"));
        });
        await Sentry.flush(1000);

        const out = sent.join("\n");
        expect(out).toContain("address-boom");
        expect(out).not.toContain(local);
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
