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

/**
 * Any mention of a token key in a client module: a property read (`session.access_token`), a
 * bracket read, a destructure (`const { access_token } = session`), a type field or a string.
 * Broad on purpose: a client module has no reason to name the key. A later module that must (an
 * OAuth client parsing its own token answer) is listed in ALLOWED with the reason and the exact
 * lines that name a key (codex r1 on #1676): a new mention there still fails.
 */
const READS_TOKEN = /\b(?:access_token|refresh_token)\b/u;
const ALLOWED: Record<string, { readonly reason: string; readonly lines: readonly string[] }> = {
    "lib/ask-dev/acr-auth.ts": {
        reason: "ACR's browser OAuth client: it parses ACR's own token answer (fcacr_/acrrt_), never an Ops token. It imports next-auth/react only to read the web principal (CHAOS-12305).",
        lines: [
            'grant_type: "refresh_token",',
            "refresh_token: family.refreshToken,",
            "access_token: access,",
            "refresh_token: refresh,",
        ],
    },
};
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
        expect(READS_TOKEN.test("const { access_token } = session;")).toBe(true);
        expect(READS_TOKEN.test("const { access_token: t } = useSession().data;")).toBe(true);
        expect(READS_TOKEN.test("type Pair = { refresh_token: string };")).toBe(true);
        expect(READS_TOKEN.test("const accessTokenLabel = 'x';")).toBe(false);
        expect(WRITES_TOKEN_PAIR.test("await update({ activeOrg: data });")).toBe(true);
        expect(WRITES_TOKEN_PAIR.test("await update({ onboardComplete: pair })")).toBe(true);
        expect(WRITES_TOKEN_PAIR.test("await update({ impersonationChanged: true })")).toBe(false);
        expect(READS_TOKEN.test("const orgId = session?.user?.org_id;")).toBe(false);
    });

    it("no client module names a token key (read, destructure, type or string)", () => {
        const hits = clientModules
            .filter(({ file, text }) => !(file in ALLOWED) && READS_TOKEN.test(text))
            .map((m) => m.file);
        expect(hits).toEqual([]);
    });

    it("an allowed module names a token key only on its pinned lines", () => {
        for (const [file, { lines }] of Object.entries(ALLOWED)) {
            const scanned = clientModules.find((m) => m.file === file);
            expect(scanned, `${file} is a client module`).toBeDefined();
            const named = scanned!.text
                .split("\n")
                .filter((line) => READS_TOKEN.test(line))
                .map((line) => line.trim());
            expect(named).toEqual(lines);
        }
    });

    it("no client module writes a token pair into the session", () => {
        const hits = clientModules
            .filter(({ text }) => WRITES_TOKEN_PAIR.test(text))
            .map((m) => m.file);
        expect(hits).toEqual([]);
    });
});
