import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";

import { createServerLogger } from "../logger";
import { scrubTelemetryText } from "../sentry/scrubber-value";
import { attachBeforeSend } from "../sentry/scrubber";

// Sentinels are built at run time from random text. They are never printed.
function token(): string {
    return `${Math.random().toString(36).slice(2, 12)}Qz${Math.random().toString(36).slice(2, 12)}`;
}

function shapes() {
    const t = Array.from({ length: 12 }, token);
    return [
        { rule: "bearer", value: t[0], text: `authorization: Bearer ${t[0]}` },
        { rule: "bearer-bare", value: t[1], text: `retry with Bearer ${t[1]} failed` },
        { rule: "basic", value: t[2], text: `Authorization: Basic ${t[2]}==` },
        { rule: "jwt", value: `${t[3]}.${t[4]}`, text: `eyJ${t[3]}.${t[3]}.${t[4]}` },
        { rule: "ghp", value: `${t[5]}`, text: `token ghp_${t[5]}${t[5]} refused` },
        {
            rule: "userinfo",
            value: t[6],
            text: `connect redis://svc:${t[6]}@cache.internal:6379/0 failed`,
        },
        {
            rule: "userinfo-http",
            value: t[7],
            text: `GET https://svc:${t[7]}@api.example/x failed`,
        },
        { rule: "cookie", value: t[8], text: `__Secure-authjs.session-token=${t[8]}; Path=/` },
        { rule: "query", value: t[10], text: `GET /cb?access_token=${t[10]}&x=1` },
        {
            rule: "pem",
            value: t[11],
            text: `-----BEGIN PRIVATE KEY-----\n${t[11]}\n-----END PRIVATE KEY-----`,
        },
    ];
}

function capture() {
    const lines: string[] = [];
    const logger = createServerLogger({ write: (line: string) => void lines.push(line) });
    return { lines, logger };
}

describe("telemetry hygiene: log lines", () => {
    it.each(shapes().map((s) => [s.rule, s] as const))(
        "keeps the %s shape out of a field, an error and a nested object",
        (_rule, s) => {
            const { lines, logger } = capture();
            logger.error({ detail: s.text }, "a field");
            logger.error({ err: new Error(s.text) }, "an error");
            logger.error({ nested: { deep: [s.text] } }, "a nested value");
            expect(lines).toHaveLength(3);
            for (const line of lines) expect(line).not.toContain(s.value);
        },
    );

    it("keeps the error name and a scrubbed message", () => {
        const { lines, logger } = capture();
        logger.error({ err: new TypeError("fetch failed") }, "x");
        const row = JSON.parse(lines[0]) as { err: { type: string; message: string } };
        expect(row.err.message).toBe("fetch failed");
        expect(row.err.type).toBe("TypeError");
    });

    it("drops the own properties of an error object", () => {
        const { lines, logger } = capture();
        const value = token();
        const err = Object.assign(new Error("call failed"), {
            response: { headers: { a: value } },
        });
        logger.error({ err }, "x");
        expect(lines[0]).not.toContain(value);
    });

    it("scrubs a string-only call and a child binding", () => {
        const { lines, logger } = capture();
        const value = token();
        logger.child({ source: `Bearer ${value}` }).info("plain");
        expect(lines[0]).not.toContain(value);
    });

    it("measures the scrub cost per line", () => {
        const { lines, logger } = capture();
        const rounds = 300;
        const err = new Error("upstream answered 502 for a sample call");
        const start = performance.now();
        for (let i = 0; i < rounds; i += 1) {
            logger.error(
                { err, operation: "sample", status: 502, route: "/x/[id]" },
                "Server call failed",
            );
        }
        const perLineMs = (performance.now() - start) / rounds;
        expect(lines).toHaveLength(rounds);
        console.info(`scrub cost per log line: ${perLineMs.toFixed(3)} ms`);
        expect(perLineMs).toBeLessThan(5);
    });
});

describe("telemetry hygiene: error reporter chain", () => {
    it.each(shapes().map((s) => [s.rule, s] as const))(
        "keeps the %s shape out of an event, a span and a breadcrumb",
        async (_rule, s) => {
            const config = attachBeforeSend({});
            const event = {
                message: s.text,
                exception: { values: [{ type: "Error", value: s.text }] },
                request: { url: "https://app.example/x", data: s.text },
                breadcrumbs: [{ message: s.text, data: { note: s.text } }],
                extra: { note: s.text },
            } as unknown as ErrorEvent;
            const out = await config.beforeSend?.(event, {});
            const crumb = config.beforeBreadcrumb?.({ message: s.text, data: { note: s.text } });
            const tx = await config.beforeSendTransaction?.(
                {
                    type: "transaction",
                    transaction: s.text,
                    spans: [{ description: s.text }],
                } as never,
                {},
            );
            for (const out2 of [out, crumb, tx]) {
                expect(JSON.stringify(out2)).not.toContain(s.value);
            }
        },
    );
});

describe("telemetry hygiene: scrubber cost on hostile text", () => {
    const filler = "a".repeat(16_000);
    const hostile: Record<string, string> = {
        "one long word": filler,
        "dotted run": "a.".repeat(8_000),
        "repeated scheme": "ab:+".repeat(4_000),
        "repeated key header": "-----BEGIN PRIVATE KEY-----".repeat(600),
        "repeated jwt start": "eyJabcd".repeat(2_000),
        "repeated bearer": "Bearer ".repeat(2_000),
        "repeated at": "x@".repeat(8_000),
    };

    it.each(Object.entries(hostile))("scrubs %s in under 250 ms", (_name, text) => {
        const start = performance.now();
        scrubTelemetryText(text);
        expect(performance.now() - start).toBeLessThan(250);
    });
});
