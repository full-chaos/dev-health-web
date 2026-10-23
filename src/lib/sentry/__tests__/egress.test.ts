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

        const all = sent.flatMap((envelope) => (JSON.parse(envelope) as [unknown, unknown[][]])[1]);
        const isEventItem = (item: unknown[]) =>
            ["event", "transaction"].includes((item[0] as { type?: string }).type ?? "");
        for (const item of all.filter((entry) => !isEventItem(entry))) {
            const user = (item[1] as { user?: unknown } | null)?.user;
            if (user !== undefined) expect(user).toEqual({ id: "user-id-1" });
        }
        const items = all
            .filter(isEventItem)
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

    // The SDK builds session items from the scope user and does not run the event hooks on them.
    it("sends no e-mail, name or IP address in a session item", async () => {
        const sent: string[] = [];
        startSdk(sent, (config) => ({ ...config, release: "egress-release" }));
        const email = ["session-user", "example.test"].join("@");
        const name = ["session", "name"].join("-");
        const ipKey = ["ip", "address"].join("_");

        Sentry.withIsolationScope((scope) => {
            scope.setUser({ email, username: name, [ipKey]: "203.0.113.90" });
            Sentry.startSession();
            Sentry.captureException(new Error("session-boom"));
            Sentry.endSession();
        });
        await Sentry.flush(1000);

        const sessions = sent
            .flatMap((envelope) => (JSON.parse(envelope) as [unknown, unknown[][]])[1])
            .filter((item) => (item[0] as { type?: string }).type === "session");
        expect(sessions.length).toBeGreaterThan(0);
        const out = JSON.stringify(sessions);
        expect(out).not.toContain(email);
        expect(out).not.toContain(name);
        expect(out).not.toContain("203.0.113.90");
        expect(out).not.toContain(ipKey);
    });

    // One probe through every envelope item type the SDK can build from the scope user: an event, a
    // transaction, a session, a log, a metric and a feedback item.
    it("sends no e-mail, name or IP address in any envelope item", async () => {
        const sent: string[] = [];
        startSdk(sent, (config) => ({
            ...config,
            release: "probe-release",
            enableLogs: true,
        }));
        const email = ["probe-user", "example.test"].join("@");
        const name = ["probe", "name"].join("-");
        const ipKey = ["ip", "address"].join("_");
        const ip = ["203", "0", "113", "91"].join(".");
        const bodyAddress = ["body-user", "example.test"].join("@");
        const feedbackEmail = ["feedback-user", "example.test"].join("@");
        const feedbackName = ["feedback", "person"].join("-");

        Sentry.withIsolationScope((scope) => {
            scope.setUser({ id: "probe-id", email, username: name, [ipKey]: ip });
            scope.setSDKProcessingMetadata({ normalizedRequest: REQUEST, ipAddress: ip });
            Sentry.startSession();
            Sentry.startSpan({ name: "GET /probe" }, () => {
                Sentry.captureException(new Error("probe-boom"));
                Sentry.logger.info(`log for ${bodyAddress}`, { who: bodyAddress });
                Sentry.metrics.count("probe_count", 1, { attributes: { who: bodyAddress } });
            });
            Sentry.captureFeedback({
                message: `feedback from ${bodyAddress}`,
                email: feedbackEmail,
                name: feedbackName,
            });
            Sentry.endSession();
        });
        await Sentry.flush(1000);

        const items = sent.flatMap(
            (envelope) => (JSON.parse(envelope) as [unknown, unknown[][]])[1],
        );
        const types = new Set(items.map((item) => (item[0] as { type?: string }).type));
        for (const type of ["event", "transaction", "session", "log", "trace_metric", "feedback"]) {
            expect(types, `item type ${type}`).toContain(type);
        }
        const out = JSON.stringify(items);
        for (const leak of [email, name, ip, bodyAddress, feedbackEmail, feedbackName]) {
            expect(out).not.toContain(leak);
        }
        expect(out).not.toContain(ipKey);
        expect(out).toContain("probe-id");

        // The backend (BugSink) stores the address of the sender of an envelope on its own; the SDK
        // never puts a client address, the auto marker or a request environment into an item.
        expect(out).not.toContain("{{auto}}");
        for (const leak of REQUEST_LEAKS) expect(out).not.toMatch(leak);
        const keys = new Set<string>();
        const walk = (value: unknown): void => {
            if (Array.isArray(value)) value.forEach(walk);
            else if (typeof value === "object" && value !== null) {
                for (const [key, nested] of Object.entries(value)) {
                    keys.add(key.toLowerCase());
                    walk(nested);
                }
            }
        };
        walk(items);
        // The envelope header (and its trace header) is walked too, not only the items.
        const headers = sent.map((envelope) => (JSON.parse(envelope) as [unknown])[0]);
        expect(headers.length).toBeGreaterThan(0);
        walk(headers);
        const headerText = JSON.stringify(headers);
        for (const leak of [
            email,
            name,
            ip,
            bodyAddress,
            feedbackEmail,
            feedbackName,
            "{{auto}}",
        ]) {
            expect(headerText).not.toContain(leak);
        }
        for (const leak of REQUEST_LEAKS) expect(headerText).not.toMatch(leak);
        expect(headerText).not.toContain("probe-id");
        for (const key of ["remote_addr", "ip_address", "ipaddress", "env", "client_ip"]) {
            expect(keys.has(key), `key ${key}`).toBe(false);
        }
        for (const header of headers) {
            expect(Object.keys(header as object).filter((k) => /user/i.test(k))).toEqual([]);
        }
        const requests = items
            .map((item) => (item[1] as { request?: Record<string, unknown> }).request)
            .filter((request) => request !== undefined);
        expect(requests.length).toBeGreaterThan(0);
        for (const request of requests) expect(request).not.toHaveProperty("env");
    });

    it("sends no user fields from tags, contexts, breadcrumbs or span attributes", async () => {
        const sent: string[] = [];
        startSdk(sent);
        const email = ["field-user", "example.test"].join("@");
        const key = (name: string) => ["user", name].join(".");
        const endKey = (name: string) => ["enduser", name].join(".");
        // Joined at run time: the SDK sends source lines around a stack frame.
        const value = (name: string) => ["leak", name].join("-");

        Sentry.withIsolationScope((scope) => {
            scope.setTag(key("email"), email);
            scope.setTag(endKey("id"), value("e1"));
            scope.setTag(key("id"), "keep-id");
            scope.setContext("enduser", { id: value("e2"), note: email });
            scope.setContext("user", { id: "ctx-id", name: value("ctx") });
            Sentry.addBreadcrumb({
                message: "crumb",
                data: { [key("name")]: value("crumb"), [endKey("id")]: value("e3"), ok: "yes" },
            });
            Sentry.startSpan(
                {
                    name: "GET /fields",
                    attributes: { [key("email")]: email, [endKey("id")]: value("e4"), ok: "yes" },
                },
                () => {
                    Sentry.startSpan(
                        { name: "child", attributes: { [endKey("id")]: value("e5") } },
                        () => Sentry.captureException(new Error("field-boom")),
                    );
                },
            );
        });
        await Sentry.flush(1000);

        const out = sent.join("\n");
        expect(out).toContain("field-boom");
        expect(out).toContain("keep-id");
        expect(out).toContain("ctx-id");
        for (const leak of [
            email,
            value("e1"),
            value("e2"),
            value("e3"),
            value("e4"),
            value("e5"),
            value("crumb"),
            value("ctx"),
        ]) {
            expect(out).not.toContain(leak);
        }
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
