import { describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";

import { createServerLogger } from "../logger";
import { scrubTelemetryText, scrubTelemetryUrl } from "../sentry/scrubber-value";
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

describe("telemetry hygiene: message strings and long userinfo", () => {
    it("scrubs the message string of an object call, a string call and an error-first call", () => {
        const { lines, logger } = capture();
        const value = token();
        logger.error({ operation: "x" }, `call failed with Bearer ${value}`);
        logger.error(`call failed with Bearer ${value}`);
        logger.error(new Error(`call failed with Bearer ${value}`));
        (logger.error as (...args: unknown[]) => void)(
            { operation: "x" },
            "failed %s",
            `Bearer ${value}`,
        );
        expect(lines).toHaveLength(4);
        for (const line of lines) expect(line).not.toContain(value);
    });

    it("keeps an error-first call readable", () => {
        const { lines, logger } = capture();
        logger.error(new TypeError("fetch failed"));
        const row = JSON.parse(lines[0]) as { msg: string; err: { type: string } };
        expect(row.msg).toBe("fetch failed");
        expect(row.err.type).toBe("TypeError");
    });

    it("scrubs the message of the browser shim in every overload", async () => {
        vi.resetModules();
        vi.stubGlobal("window", {});
        const calls: unknown[][] = [];
        const spy = vi
            .spyOn(console, "error")
            .mockImplementation((...args) => void calls.push(args));
        try {
            const { logger } = await import("../logger");
            const value = token();
            logger.error({ operation: "x" }, `failed Bearer ${value}`);
            logger.error(new Error("e"), `failed Bearer ${value}`);
            logger.error(`failed Bearer ${value}`);
            expect(calls).toHaveLength(3);
            for (const call of calls) expect(JSON.stringify(call)).not.toContain(value);
        } finally {
            spy.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    it.each([
        ["a long password", (v: string) => `https://svc:${v.repeat(60)}@api.example/x`],
        ["a username only", (v: string) => `https://${v}@api.example/x`],
        ["a password with a raw slash", (v: string) => `https://svc:${v}/abc${v}@api.example/x`],
        [
            "a long password, other scheme",
            (v: string) => `postgres://svc:${v.repeat(60)}@db.internal/d`,
        ],
    ])("removes userinfo from text and from a URL: %s", (_name, build) => {
        const value = token();
        const text = build(value);
        expect(scrubTelemetryText(`connect ${text} failed`)).not.toContain(value);
        expect(scrubTelemetryUrl(text)).not.toContain(value);
        const config = attachBeforeSend({});
        const event = { request: { url: text }, message: text } as unknown as ErrorEvent;
        expect(JSON.stringify(config.beforeSend?.(event, {}))).not.toContain(value);
    });
});

describe("telemetry hygiene: format arguments and nested errors", () => {
    const leaky = (value: string) => ({ toString: () => `Bearer ${value}${value}` });

    it("scrubs a non-string format argument: an object, an error, a symbol", () => {
        const { lines, logger } = capture();
        const value = token();
        const call = logger.error as (...args: unknown[]) => void;
        call.call(logger, { operation: "x" }, "failed %s", leaky(value));
        call.call(logger, { operation: "x" }, "failed %s", new Error(`Bearer ${value}${value}`));
        call.call(logger, { operation: "x" }, "failed %s", Symbol(`Bearer ${value}${value}`));
        call.call(logger, "failed %s", leaky(value));
        call.call(logger, { operation: "x" }, leaky(value));
        expect(lines).toHaveLength(5);
        for (const line of lines) expect(line).not.toContain(value);
    });

    it("keeps a number and a boolean format argument", () => {
        const { lines, logger } = capture();
        (logger.error as (...args: unknown[]) => void).call(logger, "took %d ms ok=%s", 12, true);
        expect((JSON.parse(lines[0]) as { msg: string }).msg).toBe("took 12 ms ok=true");
    });

    it("drops the own properties of an error nested in a field, an array and a binding", () => {
        const { lines, logger } = capture();
        const value = token();
        const nested = () =>
            Object.assign(new Error("call failed"), {
                config: { headers: { a: value } },
                cause: { note: value },
            });
        logger.error({ wrap: { deep: [{ e: nested() }] } }, "w");
        logger
            .child({ wrap: { e: nested() } })
            .child({ more: { e: nested() } })
            .info("c");
        expect(lines).toHaveLength(2);
        for (const line of lines) expect(line).not.toContain(value);
        expect(lines[0]).toContain("call failed");
    });

    it("drops the own properties of a nested error in the browser shim", async () => {
        vi.resetModules();
        vi.stubGlobal("window", {});
        const calls: unknown[][] = [];
        const spy = vi
            .spyOn(console, "error")
            .mockImplementation((...args) => void calls.push(args));
        try {
            const { logger } = await import("../logger");
            const value = token();
            const nested = Object.assign(new Error("e"), { config: { headers: { a: value } } });
            logger.error({ wrap: { e: nested } }, "w");
            logger.child({ wrap: { e: nested } }).error("c");
            expect(calls).toHaveLength(2);
            for (const call of calls) expect(JSON.stringify(call)).not.toContain(value);
        } finally {
            spy.mockRestore();
            vi.unstubAllGlobals();
        }
    });
});

describe("telemetry hygiene: values with their own printers", () => {
    it("never lets an own toJSON or a function property print unscrubbed text", () => {
        const { lines, logger } = capture();
        const value = token();
        logger.error(
            {
                x: { toJSON: () => `Bearer ${value}${value}` },
                y: () => value,
                z: [{ toJSON: () => value }],
            },
            "m",
        );
        expect(lines[0]).not.toContain(value);
    });

    it("keeps a date as an ISO string", () => {
        const { lines, logger } = capture();
        logger.info({ since: new Date("2026-10-01T00:00:00.000Z") }, "m");
        expect((JSON.parse(lines[0]) as { since: string }).since).toBe("2026-10-01T00:00:00.000Z");
    });
});

describe("telemetry hygiene: cycles, depth and own printers", () => {
    const withConfig = (value: string) =>
        Object.assign(new Error("call failed"), { config: { headers: { a: value } } });
    const nest = (depth: number, leaf: unknown): unknown =>
        depth === 0 ? leaf : { k: nest(depth - 1, leaf) };

    it("never prints an error that is reached again through a cycle", () => {
        const { lines, logger } = capture();
        const value = token();
        const a: Record<string, unknown> = { e: withConfig(value) };
        a.self = a;
        const list: unknown[] = [withConfig(value)];
        list.push(list);
        logger.error({ a }, "m");
        logger.error({ list }, "m");
        logger.child({ a }).info("c");
        expect(lines).toHaveLength(3);
        for (const line of lines) expect(line).not.toContain(value);
    });

    it.each([7, 8, 9, 10, 12, 20, 31])(
        "never prints an error or an own toJSON at depth %i",
        (depth) => {
            const { lines, logger } = capture();
            const value = token();
            logger.error({ a: nest(depth, withConfig(value)) }, "m");
            logger.error({ a: nest(depth, [withConfig(value)]) }, "m");
            logger.error({ a: nest(depth, { toJSON: () => `Bearer ${value}${value}` }) }, "m");
            logger.child({ a: nest(depth, withConfig(value)) }).info("c");
            expect(lines).toHaveLength(4);
            for (const line of lines) expect(line).not.toContain(value);
        },
    );

    it("never prints an own toJSON reached through a cycle", () => {
        const { lines, logger } = capture();
        const value = token();
        const a: Record<string, unknown> = { t: { toJSON: () => `Bearer ${value}${value}` } };
        a.self = a;
        logger.error({ a }, "m");
        expect(lines[0]).not.toContain(value);
    });

    it("keeps the browser shim safe on a cycle, a deep error and a non-string message", async () => {
        vi.resetModules();
        vi.stubGlobal("window", {});
        const calls: unknown[][] = [];
        const spy = vi
            .spyOn(console, "error")
            .mockImplementation((...args) => void calls.push(args));
        try {
            const { logger } = await import("../logger");
            const value = token();
            const a: Record<string, unknown> = { e: withConfig(value) };
            a.self = a;
            logger.error({ a }, "m");
            logger.error({ a: nest(12, withConfig(value)) }, "m");
            (logger.error as (...args: unknown[]) => void)(
                { x: 1 },
                { toString: () => `Bearer ${value}${value}` },
            );
            (logger.error as (...args: unknown[]) => void)({ x: 1 }, 42);
            expect(calls).toHaveLength(4);
            for (const call of calls) expect(JSON.stringify(call)).not.toContain(value);
        } finally {
            spy.mockRestore();
            vi.unstubAllGlobals();
        }
    });
});

describe("telemetry hygiene: userinfo without a scheme or with spaces", () => {
    it.each([
        ["a password with a space", (v: string) => `https://svc:${v} abc${v}@api.example/x`],
        ["digits then a space", (v: string) => `postgres://svc:123 ${v}@db.internal/x`],
        ["an empty user and a space", (v: string) => `redis://:${v} x@cache.internal:6379`],
        ["no scheme", (v: string) => `svc:${v}@db.internal:5432/app`],
        ["no scheme, with a dot in the user", (v: string) => `svc.user:${v}@cache.internal`],
    ])("removes userinfo from text: %s", (_name, build) => {
        const value = token();
        expect(scrubTelemetryText(`connect ${build(value)} failed`)).not.toContain(value);
        const config = attachBeforeSend({});
        const event = { message: build(value) } as unknown as ErrorEvent;
        expect(JSON.stringify(config.beforeSend?.(event, {}))).not.toContain(value);
    });

    it.each([
        ["postgres://admin:1234 secretword@db.internal/x", "secretword"],
        ["postgres://admin:1234 Hunter@db.internal/x", "Hunter"],
        ["postgres://admin:99999 hunter two@db.internal/x", "hunter"],
        ["postgres://admin:12 secretword@db.internal/x", "secretword"],
        ["redis://:1234 secretword@cache.internal", "secretword"],
        ["https://svc:123 more@api.example/x", "more"],
    ])("removes %s whatever the words after the digits are", (text, word) => {
        expect(scrubTelemetryText(`connect ${text} failed`)).not.toContain(word);
        const config = attachBeforeSend({});
        const event = { message: text } as unknown as ErrorEvent;
        expect(JSON.stringify(config.beforeSend?.(event, {}))).not.toContain(word);
    });

    it.each([
        "see https://example.com for details, mail the team",
        "took 12:30 at db.internal",
        "mailto:",
    ])("leaves %s readable", (text) => {
        expect(scrubTelemetryText(text)).not.toContain("[Filtered]");
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

describe("telemetry hygiene: userinfo rule keeps ordinary URLs", () => {
    it.each([
        "http://host:8080/path?e=a",
        "https://example.com/p?name=a",
        "https://example.com/a/b",
    ])("leaves %s readable", (text) => {
        expect(scrubTelemetryText(text)).not.toContain("[Filtered]");
    });
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
        "repeated scheme and colon": "ab://c:".repeat(2_000),
        "scheme then many at": `a://${"@".repeat(15_000)}`,
        "at after a long local part": `${"a".repeat(15_000)}@b.example`,
        "local part with dots then at": `${"a.".repeat(7_000)}@`,
        "repeated address start": "a@b.".repeat(4_000),
        "repeated label run": `x@${"a.".repeat(7_000)}`,
        "repeated encoded at": "a%40".repeat(4_000),
        "many addresses": "ab@cd.example ".repeat(1_100),
        "dots only after at": `x@${".".repeat(15_000)}`,
        "unicode letters": "\u00e4".repeat(16_000),
        "unicode dotted local part": "\u00e4.".repeat(8_000) + "@",
        "unicode label run": `x@${"\u00e4.".repeat(7_000)}`,
        "full width at signs": "a\uFF20".repeat(8_000),
        "nested escapes": "%25".repeat(5_000) + "40",
        "unicode escapes": "%C3%A4".repeat(2_500),
        "numeric then letter labels": `a@${"1.2.".repeat(3_500)}x`,
        "repeated version starts": "a@1.2.3-".repeat(2_000),
        "version with a long pre-release": `a@1.2.3-${"a.".repeat(7_000)}`,
        "version with a long build": `a@1.2.3+${"b.".repeat(7_000)}`,
        "mixed escape runs": "%41%42".repeat(2_600),
        "version suffix runs": "a@1.2.3.min.".repeat(1_300),
        "retina name runs": "a@2x.".repeat(3_000),
        "address then extension runs": "ab@cd.example.json ".repeat(840),
        "repeated escapes": "%41".repeat(5_000),
        "long token then an escape": `${"a".repeat(15_900)}%41`,
        "percent signs only": "%".repeat(16_000),
        "bad escapes in words": "a%zz ".repeat(3_000),
        "escape and dot runs": "a%2E".repeat(4_000),
        "escapes split by spaces": "x%40y ".repeat(2_500),
        "hyphen run after at": `x@${"-".repeat(15_000)}.com`,
    };

    it.each(Object.entries(hostile))("scrubs %s in under 250 ms", (_name, text) => {
        const start = performance.now();
        scrubTelemetryText(text);
        expect(performance.now() - start).toBeLessThan(250);
    });
});

// Address shapes are built at run time from random text and never printed.
type AddressParts = { local: string; domain: string; text: string };
function address(): { local: string; domain: string; text: string } {
    const local = `${token()}`;
    const domain = `h${Math.random().toString(36).slice(2, 8)}.example`;
    return { local, domain, text: `${local}@${domain}` };
}

describe("telemetry hygiene: e-mail shapes", () => {
    const encodeAll = (text: string): string =>
        [...text]
            .map((c) => (/[a-z\d]/i.test(c) ? c : `%${c.charCodeAt(0).toString(16)}`))
            .join("");
    const forms: Array<[string, (a: string) => string]> = [
        ["plain", (a) => a],
        ["in a sentence", (a) => `failed for ${a}, retry later`],
        ["upper case", (a) => a.toUpperCase()],
        ["in parentheses", (a) => `user (${a}) not found`],
        ["with a plus tag", (a) => a.replace("@", "+tag@")],
        ["with dots", (a) => `first.last.${a}`],
        ["with a trailing period", (a) => `sent to ${a}.`],
        ["after a colon", (a) => `to: ${a}`],
        ["two on one line", (a) => `${a} and ${a.replace("@", "2@")}`],
        ["in a url query", (a) => `GET /search?q=${a}&x=1`],
        ["in an encoded url query", (a) => `GET /search?q=${encodeURIComponent(a)}`],
        ["in a url path", (a) => `GET /users/${a}/settings`],
        ["in an encoded url path", (a) => `GET /users/${a.replace(/@/gu, "%40")}/settings`],
        ["in an absolute url path", (a) => `https://app.example/users/${a}/x`],
        ["after a mailto scheme", (a) => `mailto:${a}`],
        ["in a json string", (a) => JSON.stringify({ to: a })],
        ["fully encoded", (a) => encodeAll(a)],
        ["encoded at and dots", (a) => a.replace(/@/gu, "%40").replace(/\./g, "%2E")],
        ["encoded in lower case", (a) => a.replace(/@/gu, "%40").replace(/\./g, "%2e")],
        ["encoded twice", (a) => encodeAll(encodeAll(a))],
        ["encoded in a url path", (a) => `GET /u/${encodeAll(a)}/x`],
        ["encoded in an absolute url path", (a) => `https://app.example/u/${encodeAll(a)}/x`],
        ["encoded in a url query", (a) => `GET /search?q=${encodeAll(a)}`],
        ["encoded four times", (a) => encodeAll(encodeAll(encodeAll(encodeAll(a))))],
        [
            "encoded eight times",
            (a) => Array.from({ length: 8 }).reduce<string>((v) => encodeAll(v), a),
        ],
        ["encoded with a bad escape after", (a) => `${encodeAll(a)}%ZZ`],
        ["encoded with a bad escape before", (a) => `%ZZ${encodeAll(a)}`],
        ["encoded after a stray percent sign", (a) => `100%${encodeAll(a)}`],
        [
            "a utf-8 host with a bad escape after",
            (a) => `${a.replace("example", "ex%C3%A4mple")}%ZZ`,
        ],
        [
            "a utf-8 host with a stray percent sign",
            (a) => `100%${a.replace("example", "ex%C3%A4mple")}`,
        ],
        [
            "a full width at sign as escapes with a bad escape",
            (a) => `${a.replace(/@/gu, "%EF%BC%A0")}%ZZ`,
        ],
        ["a cut utf-8 escape before a valid address", (a) => `%C3${encodeAll(a)}`],
    ];

    it.each(forms)("removes an address from text: %s", (_name, build) => {
        const a = address();
        const out = scrubTelemetryText(build(a.text));
        expect(out).not.toContain(a.local);
        expect(out).not.toContain(a.domain);
        expect(out).toMatch(/\[Filtered\]|%5BFiltered%5D/u);
    });

    it.each(forms)("removes an address from a request url: %s", (_name, build) => {
        const a = address();
        const out = scrubTelemetryUrl(
            `https://app.example/x/${build(a.text).replace(/\s+/g, ",")}`,
        );
        expect(out).not.toContain(a.local);
        expect(out.toLowerCase()).not.toContain(a.domain);
    });

    it.each([
        ["a numeric first label", (a: AddressParts) => `${a.local}@123.${a.domain}`],
        ["a digit then letters", (a: AddressParts) => `${a.local}@1${a.domain}`],
        ["a short numeric host name", (a: AddressParts) => `${a.local}@3m.example`],
        [
            "a numeric label and a long path",
            (a: AddressParts) => `GET https://x.example/u/${a.local}@123.${a.domain}/x`,
        ],
    ])("removes an address with %s", (_name, build) => {
        const a = address();
        const out = scrubTelemetryText(build(a));
        expect(out).not.toContain(a.local);
        expect(scrubTelemetryUrl(`https://app.example/u/${build(a)}/x`)).not.toContain(a.local);
    });

    it.each([
        ["two numeric labels, then a name", (a: AddressParts) => `${a.local}@123.456.${a.domain}`],
        ["three numeric labels, then a name", (a: AddressParts) => `${a.local}@1.2.3.${a.domain}`],
        ["a unicode host", (a: AddressParts) => `${a.local}@ex\u00e4mple-${a.domain}`],
        ["a unicode local part", (a: AddressParts) => `r\u00e9${a.local}@${a.domain}`],
        ["an escaped unicode host", (a: AddressParts) => `${a.local}@ex%C3%A4mple-${a.domain}`],
        [
            "a punycode host",
            (a: AddressParts) => `${a.local}@${a.domain.replace("example", "xn--mnchen-3ya")}`,
        ],
        ["a punycode last label", (a: AddressParts) => `${a.local}@mail.xn--p1ai`],
        ["a full width at sign", (a: AddressParts) => `${a.local}\uFF20${a.domain}`],
        [
            "a host label that starts with a digit and letters",
            (a: AddressParts) => `${a.local}@2xx.${a.domain}`,
        ],
        [
            "a host label made of a digit and a name",
            (a: AddressParts) => `${a.local}@1password.${a.domain}`,
        ],
        ["two numeric labels then a name", (a: AddressParts) => `${a.local}@1.2.${a.domain}`],
        ["three numeric labels then a name", (a: AddressParts) => `${a.local}@1.2.3.${a.domain}`],
        [
            "numeric labels with letters and more labels",
            (a: AddressParts) => `${a.local}@123.45.${a.domain}`,
        ],
        ["an ideographic full stop", (a: AddressParts) => `${a.local}@mail\u3002${a.domain}`],
    ])("removes an address with %s", (_name, build) => {
        const a = address();
        expect(scrubTelemetryText(`for ${build(a)} now`)).not.toContain(a.local);
        expect(scrubTelemetryUrl(`https://app.example/u/${build(a)}/x`)).not.toContain(a.local);
    });

    it.each([
        ["a json file name", (a: AddressParts) => `${a.text}.json`],
        [
            "a png file name in a url path",
            (a: AddressParts) => `https://app.example/u/${a.text}.png`,
        ],
        ["a pdf file name", (a: AddressParts) => `report for ${a.text}.pdf done`],
        ["a txt file name", (a: AddressParts) => `${a.text}.txt`],
        ["a min.js file name", (a: AddressParts) => `${a.text}.min.js`],
        [
            "a numeric suffix in a query value",
            (a: AddressParts) => `https://app.example/x?q=${a.text}.2`,
        ],
        ["a css map name", (a: AddressParts) => `${a.text}.css.map`],
        ["a tar.gz name", (a: AddressParts) => `${a.text}.tar.gz`],
        ["a version-like suffix", (a: AddressParts) => `${a.text}.1.2.3`],
    ])("removes an address followed by %s", (_name, build) => {
        const a = address();
        expect(scrubTelemetryText(build(a))).not.toContain(a.local);
        expect(scrubTelemetryUrl(`https://app.example/u/${build(a)}`)).not.toContain(a.local);
    });

    it("removes an address whose host is not exactly version text", () => {
        const a = address();
        const local = a.local;
        for (const host of ["1.2xx.example", "1.2.example", "2xx.example", "1password.example"]) {
            expect(scrubTelemetryText(`for ${local}@${host} now`)).not.toContain(local);
        }
    });

    it("keeps the words around an address", () => {
        const a = address();
        expect(scrubTelemetryText(`user ${a.text} not found`)).toBe("user [Filtered] not found");
    });

    it("keeps the userinfo rules first: a connection string stays one filtered span", () => {
        expect(scrubTelemetryText("see https://fake@sentry.io/1")).toBe("see https://sentry.io/1");
        expect(scrubTelemetryText("x svc:pw@db.internal:5432/app y")).toBe(
            "x [Filtered]:5432/app y",
        );
    });

    it("keeps an address out of a log field, an error, a nested object, a binding and a message", () => {
        const { lines, logger } = capture();
        const a = address();
        logger.error({ detail: `for ${a.text}` }, "a field");
        logger.error({ err: new Error(`for ${a.text}`) }, "an error");
        logger.error({ nested: { deep: [a.text] } }, "a nested value");
        logger.child({ who: a.text }).info("a binding");
        logger.error({ operation: "x" }, `failed for ${a.text}`);
        logger.error(`failed for ${a.text}`);
        (logger.error as (...args: unknown[]) => void)({ operation: "x" }, "failed %s", a.text);
        expect(lines).toHaveLength(7);
        for (const line of lines) {
            expect(line).not.toContain(a.local);
            expect(line).not.toContain(a.domain);
        }
    });

    it("keeps an address out of an event, a breadcrumb, a span and a transaction", async () => {
        const config = attachBeforeSend({});
        const a = address();
        const event = {
            message: `for ${a.text}`,
            exception: { values: [{ type: "Error", value: `for ${a.text}` }] },
            request: { url: `https://app.example/users/${a.text}/x?q=${a.text}`, data: a.text },
            breadcrumbs: [{ message: a.text, data: { note: a.text } }],
            extra: { who: a.text },
            tags: { who: a.text },
        } as unknown as ErrorEvent;
        const out = await config.beforeSend?.(event, {});
        const crumb = config.beforeBreadcrumb?.({ message: a.text, data: { note: a.text } });
        const tx = await config.beforeSendTransaction?.(
            {
                type: "transaction",
                transaction: `GET /users/${a.text}`,
                spans: [{ description: a.text }],
            } as never,
            {},
        );
        for (const part of [out, crumb, tx]) {
            expect(JSON.stringify(part)).not.toContain(a.local);
            expect(JSON.stringify(part)).not.toContain(a.domain);
        }
    });

    it("keeps an address out of the browser shim", async () => {
        vi.resetModules();
        vi.stubGlobal("window", {});
        const calls: unknown[][] = [];
        const spy = vi
            .spyOn(console, "error")
            .mockImplementation((...args) => void calls.push(args));
        try {
            const { logger } = await import("../logger");
            const a = address();
            logger.error({ operation: "x", who: a.text }, `failed for ${a.text}`);
            logger.error(`failed for ${a.text}`);
            expect(calls).toHaveLength(2);
            for (const call of calls) expect(JSON.stringify(call)).not.toContain(a.local);
        } finally {
            spy.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    it.each([
        "install @scope/pkg now",
        "resolved @types/node@20.1.0 and pkg@1.2.3",
        "resolved pkg@1.2.3-rc.next and pkg@latest and eslint@^8.0.0",
        "resolved pkg@1.0.0-beta.next and tool@2x.png",
        "resolved lib@2.0.0-rc.1+build.5 and lib@1.2.3-alpha.beta.1 and lib@1.2.3+meta.next",
        "loading jquery@3.7.1.min.js and app@1.4.0.min.css and vendor@1.2.3.js.map",
        "loading lib@1.2.3-beta.1.min.js and lib@1.2.3.css.map",
        "resolved pkg@v1.2.3-rc.next and pkg@v2.0.0-beta.1.next. Done",
        "took 100% of 50%25 budget",
        "path /a/b%20c/d and q=a%2Fb",
        "ping @bob and @alice about it",
        "clone git@github.com:org/repo.git first",
        "ssh git@host.example:repo",
        "assets logo@2x.png and bg@3x.webp",
        "GET https://registry.example/@scope/pkg/-/pkg-1.0.0.tgz",
        "GET https://example.com/@user/page",
        "GET https://example.com/a@b/c",
        "listening on host:8080 at 12:30",
        "a@b.c is too short to be a host",
        "user@localhost and user@host",
        "email me",
    ])("leaves %s readable", (text) => {
        expect(scrubTelemetryText(text)).toBe(text);
    });

    it("keeps a scoped package url readable as a request url", () => {
        expect(scrubTelemetryUrl("https://registry.example/@scope/pkg")).toBe(
            "https://registry.example/@scope/pkg",
        );
        expect(scrubTelemetryUrl("/packages/@scope/pkg@1.2.3")).toBe("/packages/@scope/pkg@1.2.3");
    });
});

describe("telemetry hygiene: e-mail rule cost", () => {
    it("scrubs a log line that holds an address within the per-line limit", () => {
        const { lines, logger } = capture();
        const a = address();
        const rounds = 300;
        const start = performance.now();
        for (let i = 0; i < rounds; i += 1) {
            logger.error(
                { err: new Error(`upstream answered 502 for ${a.text}`), operation: "sample" },
                `Server call failed for ${a.text}`,
            );
        }
        const perLineMs = (performance.now() - start) / rounds;
        expect(lines).toHaveLength(rounds);
        console.info(`scrub cost per log line with an address: ${perLineMs.toFixed(3)} ms`);
        expect(perLineMs).toBeLessThan(5);
    });

    it("scrubs 16 KB of mixed text and addresses in under 250 ms", () => {
        const chunk = "request failed for someone@mail.example and pkg@1.2.3 at /x/y?q=1 ";
        const text = chunk.repeat(Math.floor(16_000 / chunk.length));
        const start = performance.now();
        const out = scrubTelemetryText(text);
        expect(performance.now() - start).toBeLessThan(250);
        expect(out).not.toContain("someone@mail.example");
    });
});

describe("telemetry hygiene: residual address forms", () => {
    type Parts = { local: string; host: string };
    const parts = (): Parts => ({
        local: token(),
        host: `h${Math.random().toString(36).slice(2, 8)}.example`,
    });
    const octets = ["192", "0", "2", String(1 + Math.floor(Math.random() * 200))];
    const v4 = octets.join(".");
    const v6 = ["2001", "db8", "", String(1 + Math.floor(Math.random() * 90))].join(":");
    const joiners = ["‍", "‌", "​", "⁠", "﻿", "­", "‎"];

    const forms: Array<[string, (p: Parts) => string]> = [
        ["a decimal reference", (p) => `${p.local}&#64;${p.host}`],
        ["a padded decimal reference", (p) => `${p.local}&#0064;${p.host}`],
        ["a hex reference", (p) => `${p.local}&#x40;${p.host}`],
        ["a padded hex reference", (p) => `${p.local}&#x0040;${p.host}`],
        ["an upper case hex reference", (p) => `${p.local}&#X40;${p.host}`],
        ["a named reference", (p) => `${p.local}&commat;${p.host}`],
        ["a decimal reference for the dot", (p) => `${p.local}@${p.host.replace(".", "&#46;")}`],
        ["a hex reference for the dot", (p) => `${p.local}@${p.host.replace(".", "&#x2e;")}`],
        ["a named reference for the dot", (p) => `${p.local}@${p.host.replace(".", "&period;")}`],
        ["references for both", (p) => `${p.local}&#64;${p.host.replace(".", "&#46;")}`],
        ["a small at sign", (p) => `${p.local}﹫${p.host}`],
        ["a small full stop", (p) => `${p.local}@${p.host.replace(".", "﹒")}`],
        ["a one dot leader", (p) => `${p.local}@${p.host.replace(".", "․")}`],
        ...joiners.flatMap((j, i): Array<[string, (p: Parts) => string]> => [
            [
                `format char ${i} inside a label`,
                (p) => `${p.local}@${p.host.replace("exa", `ex${j}a`)}`,
            ],
            [
                `format char ${i} before the dot`,
                (p) => `${p.local}@${p.host.replace(".", `${j}.`)}`,
            ],
            [`format char ${i} after the dot`, (p) => `${p.local}@${p.host.replace(".", `.${j}`)}`],
            [`format char ${i} before the host`, (p) => `${p.local}@${j}${p.host}`],
            [`format char ${i} before the at sign`, (p) => `${p.local}${j}@${p.host}`],
            [
                `format char ${i} inside the local part`,
                (p) => `${p.local.slice(0, 8)}${j}${p.local.slice(8)}@${p.host}`,
            ],
            [
                `format char ${i} inside the last label`,
                (p) => `${p.local}@${p.host.replace("example", `exa${j}mple`)}`,
            ],
        ]),
        ["an ipv4 host", (p) => `${p.local}@${v4}`],
        ["an ipv4 host with a trailing period", (p) => `sent to ${p.local}@${v4}.`],
        ["an ipv6 literal", (p) => `${p.local}@[${v6}]`],
        ["a tagged ipv6 literal", (p) => `${p.local}@[IPv6:${v6}]`],
        ["an ipv6 literal with a zone", (p) => `${p.local}@[fe80::1%eth0]`],
        ["an encoded ipv4 host", (p) => `${p.local}%40${v4}`],
    ];

    const stripCf = (text: string): string => text.replace(/\p{Cf}/gu, "");

    it.each(forms)("removes an address with %s", (_name, build) => {
        const p = parts();
        const text = build(p);
        const key = p.local.slice(0, 8);
        const out = scrubTelemetryText(`for ${text} now`);
        expect(stripCf(out)).not.toContain(key);
        expect(out).toContain("[Filtered]");
        const url = scrubTelemetryUrl(
            `https://app.example/u/${text.replace(/[ \t\r\n]+/g, ",")}/x`,
        );
        expect(stripCf(url)).not.toContain(key);
    });

    it.each(forms)("removes an address with %s in a nested value", (_name, build) => {
        const p = parts();
        const { lines, logger } = capture();
        logger.error({ nested: { deep: [build(p)] } }, "a nested value");
        expect(stripCf(lines[0])).not.toContain(p.local.slice(0, 8));
    });

    it("keeps text that is not an address", () => {
        for (const text of [
            "pkg@1.2.3 installed",
            "see &commat;scope for details",
            "a &amp; b &#38; c",
            "@[team] was mentioned",
            "x @ [y]",
            "ver@1.2.3-rc.1",
            "price &#36;5 &#x24;6",
            "ok‍ done",
            "file name⁠ here",
            "host 192.0.2.7 refused",
            "at [fe80::1] listening",
        ]) {
            expect(scrubTelemetryText(text)).toBe(text);
        }
    });

    const hostile: Record<string, (n: number) => string> = {
        "decimal references": (n) => "&#64;".repeat(n / 5),
        "padded hex references": (n) => "&#x00000040;".repeat(n / 12),
        "references after a local part": (n) => "a&#64;b&#46;".repeat(n / 12),
        "format chars only": (n) => "‍".repeat(n),
        "a local part of format chars": (n) => `a${"‍".repeat(n - 2)}@`,
        "format chars in a label run": (n) => `a@${"b‍.".repeat(n / 3)}`,
        "format chars around dots": (n) => `a@${"‍.‍".repeat(n / 3)}`,
        "ipv4 starts": (n) => "a@1.2.3.".repeat(n / 8),
        "ipv4 runs": (n) => `a@${"1.".repeat(n / 2)}`,
        "bracket starts": (n) => "a@[1:".repeat(n / 5),
        "an open bracket run": (n) => `a@[${"1:".repeat(n / 2)}`,
        "small at signs": (n) => "a﹫".repeat(n / 2),
        "small full stops": (n) => `a@${"b﹒".repeat(n / 2)}`,
        "one dot leaders": (n) => `a@${"b․".repeat(n / 2)}`,
        "mixed forms": (n) => "a&#64;b‍.﹒[1:".repeat(n / 14),
    };
    const best = (text: string): number => {
        let min = Infinity;
        for (let i = 0; i < 5; i += 1) {
            const start = performance.now();
            scrubTelemetryText(text);
            min = Math.min(min, performance.now() - start);
        }
        return min;
    };

    it.each(Object.entries(hostile))("scrubs %s in bounded and linear time", (_name, build) => {
        const small = best(build(8_192));
        const large = best(build(16_000));
        expect(large).toBeLessThan(250);
        // Twice the input may cost about twice the time: a quadratic rule grows about four times.
        expect(large < 25 || large / Math.max(small, 0.5) < 3.2).toBe(true);
    });
});
