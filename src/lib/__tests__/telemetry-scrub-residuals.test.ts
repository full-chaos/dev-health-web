import { describe, expect, it } from "vitest";

import { createServerLogger } from "../logger";
import { scrubTelemetryText, scrubTelemetryUrl } from "../sentry/scrubber-value";

// CHAOS-10777: residual credential shapes after the first scrubber rules. Values are built at run time.
function token(): string {
    return `${Math.random().toString(36).slice(2, 12)}Qz${Math.random().toString(36).slice(2, 12)}`;
}

function capture() {
    const lines: string[] = [];
    const logger = createServerLogger({ write: (line: string) => void lines.push(line) });
    return { lines, logger };
}

describe("residual: password with a space and a slash", () => {
    it.each([
        ["scheme, space then slash", (v: string) => `postgres://svc:${v} ab/${v}@db.internal/x`],
        ["scheme, slash then space", (v: string) => `https://svc:${v}/ ${v}@api.example/x`],
        ["scheme, two spaces and slashes", (v: string) => `redis://:a b/${v} c/d@cache.internal`],
    ])("removes userinfo from text: %s", (_name, build) => {
        const value = token();
        expect(scrubTelemetryText(`connect ${build(value)} failed`)).not.toContain(value);
        expect(scrubTelemetryUrl(build(value))).not.toContain(value);
        const { lines, logger } = capture();
        logger.error({ detail: build(value) }, "a field");
        expect(lines[0]).not.toContain(value);
    });
});

describe("residual: astral characters count as one toward the bounds (CHAOS-12685)", () => {
    const EMOJI = "\u{1F4A5}";
    it.each([
        [
            "a 65 code point user",
            (v: string) => `postgres://${EMOJI.repeat(65)}:${v} /tail@db.internal/x`,
        ],
        [
            "a 247 code point password",
            (v: string) => `postgres://svc:${v}${EMOJI.repeat(220)} tail@db.internal/x`,
        ],
    ])("removes userinfo from text and url: %s", (_name, build) => {
        const value = token();
        expect(scrubTelemetryText(`connect ${build(value)} failed`)).not.toContain(value);
        expect(scrubTelemetryUrl(build(value))).not.toContain(value);
    });

    it("keeps the 250 ms budget on 16 KB of astral characters", () => {
        const text = `postgres://svc:${`${EMOJI} `.repeat(4_000)}@db.internal`.slice(0, 16_000);
        const start = performance.now();
        scrubTelemetryText(text);
        expect(performance.now() - start).toBeLessThan(250);
    });
});

describe("residual: scheme-less userinfo, host forms", () => {
    it.each([
        ["bracketed IPv6 host", (v: string) => `svc:${v}@[2001:db8::1]:5432/app`],
        ["underscore host", (v: string) => `svc:${v}@_db.internal:5432`],
        ["underscore host, no port", (v: string) => `svc:${v}@_cache`],
    ])("removes userinfo from text: %s", (_name, build) => {
        const value = token();
        expect(scrubTelemetryText(`connect ${build(value)} failed`)).not.toContain(value);
        const { lines, logger } = capture();
        logger.error({ detail: build(value) }, "a field");
        expect(lines[0]).not.toContain(value);
    });
});

describe("residual: rows closed by a written reason, pinned", () => {
    it("row 2: a text longer than the scalar limit is dropped whole", () => {
        const value = token();
        expect(scrubTelemetryText(`x://u:${value} ${"a".repeat(20_000)}@h`)).toBe("[Filtered]");
    });

    it("row 2: a space password over 256 characters keeps the 250 ms budget on 16 KB", () => {
        const text = `postgres://svc:${"a b ".repeat(4_000)}@db.internal`.slice(0, 16_000);
        const start = performance.now();
        scrubTelemetryText(text);
        expect(performance.now() - start).toBeLessThan(250);
    });

    it("row 3: a password with a raw newline is removed", () => {
        const value = token();
        const { lines, logger } = capture();
        logger.error({ detail: `postgres://svc:${value}\nmore@db.internal/x` }, "a field");
        expect(lines).toHaveLength(1);
        expect(lines[0]).not.toContain(value);
        expect(scrubTelemetryText(`postgres://svc:${value}\nmore@db.internal/x`)).not.toContain(
            value,
        );
    });

    it("row 5: a scheme-less user:password in a url or in text does not leak", () => {
        const value = token();
        expect(scrubTelemetryUrl(`svc:${value}@db.internal`)).not.toContain(value);
        expect(scrubTelemetryText(`svc:${value}@db.internal`)).not.toContain(value);
    });

    it("row 7: a plain object under %j prints as [object Object]", () => {
        const { lines, logger } = capture();
        (logger.error as (...args: unknown[]) => void).call(logger, "got %j", { a: 1 });
        expect((JSON.parse(lines[0]) as { msg: string }).msg).toBe("got '[object Object]'");
    });

    it("row 8: object keys are not scrubbed, values are", () => {
        const value = token();
        const { lines, logger } = capture();
        logger.error({ detail: { keyname: `Bearer ${value}` } }, "a field");
        expect(lines[0]).toContain("keyname");
        expect(lines[0]).not.toContain(value);
    });
});

describe("residual: false positives stay visible", () => {
    it.each([
        ["scoped package", "install @types/node and @scope/pkg for the build"],
        ["scoped package with version", "npm i @types/node@20.11.0 done"],
        ["host:port", "listening on db.internal:5432 and cache.internal:6379"],
        ["host:port url", "GET http://host:8080/x?e=a ok"],
        ["time", "took 12:30 at db.internal"],
        ["scp remote (exempt)", "copy to deploy@build.internal:/srv/app done"],
        ["mailto alone", "mailto:"],
        ["path colon", "see src/lib/a.ts:12:5 for details"],
        ["plain text colon", "error: file not found in the tree"],
    ])("leaves %s readable", (_name, text) => {
        expect(scrubTelemetryText(text)).toBe(text);
    });

    it.each([
        ["e-mail in an audit line", "audit: user person@example.test updated role to admin"],
        ["user@host in an ssh-like note", "ssh deploy@build.internal uptime ok"],
    ])("over-scrub is visible: %s", (_name, text) => {
        const out = scrubTelemetryText(text);
        expect(out).toContain("[Filtered]");
        expect(out).not.toContain("@");
    });
});
