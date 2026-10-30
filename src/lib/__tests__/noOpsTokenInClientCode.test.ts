import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { sourceFiles } from "@/test/sourceTree";

/**
 * CHAOS-12088: page JS never holds an Ops token. The session endpoint strips the tokens
 * (`authBrowserSession.ts`, tested against the real Auth.js handlers in
 * `app/api/auth/[...nextauth]/__tests__/route.test.ts`); this guard keeps client code from
 * depending on them again. A client module is a file with the `"use client"` directive or one that
 * imports `next-auth/react`. It is a source scan, not a module-graph walk: a server-free helper that
 * a client module imports is not checked here (the e2e session check covers the served bytes).
 */
const SRC = join(process.cwd(), "src");
const clientModules = sourceFiles(SRC)
    .filter((f) => /\.tsx?$/u.test(f) && !/\.(test|spec)\.tsx?$/u.test(f))
    .filter((f) => !/__(tests|generated)__/u.test(f))
    .map((f) => ({ file: relative(SRC, f), text: readFileSync(f, "utf8") }))
    .filter(
        ({ text }) =>
            /^\s*["']use client["'];?/u.test(text) || /from\s+["']next-auth\/react["']/u.test(text),
    );

/** A read of a token key: `.access_token`, `["refresh_token"]`, `accessToken` on a session. */
const READS_TOKEN =
    /\??\.(?:access_token|refresh_token)\b|\[\s*["'](?:access|refresh)_token["']\s*\]/u;
/** A browser `update()` that carries a token pair: only server code writes tokens into the session. */
const WRITES_TOKEN_PAIR = /\bupdate\(\s*\{\s*(?:activeOrg|onboardComplete)\b/u;

describe("no Ops token in client code (CHAOS-12088)", () => {
    it("finds the client modules (a scan that sees nothing must fail)", () => {
        const files = clientModules.map(({ file }) => file);
        expect(files).toContain("components/auth/OnboardForm.tsx");
        expect(files).toContain("components/navigation/OrgSwitcher.tsx");
        expect(clientModules.length).toBeGreaterThan(50);
    });

    it("the patterns match the defects they exist for", () => {
        expect(READS_TOKEN.test("Authorization: `Bearer ${session?.access_token}`")).toBe(true);
        expect(READS_TOKEN.test('const t = session["refresh_token"];')).toBe(true);
        expect(WRITES_TOKEN_PAIR.test("await update({ activeOrg: data });")).toBe(true);
        expect(WRITES_TOKEN_PAIR.test("await update({ onboardComplete: pair })")).toBe(true);
        expect(WRITES_TOKEN_PAIR.test("await update({ impersonationChanged: true })")).toBe(false);
        expect(READS_TOKEN.test("const orgId = session?.user?.org_id;")).toBe(false);
    });

    it("no client module reads a token from the session", () => {
        const hits = clientModules.filter(({ text }) => READS_TOKEN.test(text)).map((m) => m.file);
        expect(hits).toEqual([]);
    });

    it("no client module writes a token pair into the session", () => {
        const hits = clientModules
            .filter(({ text }) => WRITES_TOKEN_PAIR.test(text))
            .map((m) => m.file);
        expect(hits).toEqual([]);
    });
});
