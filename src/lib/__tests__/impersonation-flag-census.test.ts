import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// D6720: impersonating = the delegated token fields are present (isImpersonatingToken). Every
// line of src that names the impersonation flag or the delegated token fields is listed here. A new
// reader or writer fails; a listed line that is gone fails too. Comment lines are skipped.

const ROOT = path.resolve(__dirname, "../../..");
const FLAG = /is_impersonating|imp_access_token|imp_expires_at/;
const isComment = (line: string) => /^\s*(\/\/|\/\*|\*)/.test(line);

const walk = (rel: string): string[] => {
    const out: string[] = [];
    for (const name of readdirSync(path.join(ROOT, rel))) {
        const child = `${rel}/${name}`;
        if (name === "__tests__" || name === "node_modules") continue;
        if (statSync(path.join(ROOT, child)).isDirectory()) out.push(...walk(child));
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(child);
    }
    return out;
};

const flagLines = (rel: string) =>
    readFileSync(path.join(ROOT, rel), "utf8")
        .split("\n")
        .filter((line) => !isComment(line) && FLAG.test(line))
        .map((line) => line.trim());

// The accessor module: the only file that reads or writes the delegated token fields.
const ACCESSOR = "src/lib/impersonationToken.ts";

const ALLOWED: Readonly<Record<string, readonly string[]>> = {
    [ACCESSOR]: [
        "token.imp_access_token = pair.access_token;",
        "token.imp_expires_at =",
        "token.imp_access_token = undefined;",
        "token.imp_expires_at = undefined;",
        'return typeof token.imp_access_token === "string" && token.imp_access_token !== "";',
        "return isImpersonatingToken(token) ? (token.imp_access_token as string) : undefined;",
        "if (!isImpersonatingToken(token) || token.imp_access_token !== ended) return false;",
        "return token.imp_expires_at === undefined || now >= token.imp_expires_at;",
        "...delegationIdsOf(token.imp_access_token),",
    ],
    // Types: the session field (UI contract) and the JWT delegated fields. No JWT flag.
    "src/types/next-auth.d.ts": [
        "is_impersonating?: boolean;",
        "imp_access_token?: string;",
        "imp_expires_at?: number;",
    ],
    // The session callback writes the session field from the accessor; the status merge reads
    // the backend answer (end or display only); requireRole / requireSuperuser read the field.
    "src/lib/auth.ts": [
        "if (status?.is_impersonating === false) {",
        "} else if (status?.is_impersonating === true && isImpersonatingToken(token)) {",
        "session.user.is_impersonating = impersonating;",
        "is_impersonating: impersonating,",
        "session.user.is_superuser === true && session.user.is_impersonating !== true;",
        "if (session.user.is_superuser !== true || session.user.is_impersonating === true) {",
    ],
    // Guards on the session field.
    "src/lib/admin/server/_shared.ts": [
        "session.user?.is_impersonating === true && opts.allowImpersonating !== true;",
    ],
    "src/app/api/auth/change-password/route.ts": ["if (session.user?.is_impersonating) {"],
    "src/app/api/auth/switch-org/route.ts": ["if (session.user?.is_impersonating) {"],
    "src/lib/auth/platform/limits.ts": [
        'if (session.user?.is_impersonating === true) return "impersonating";',
        'return status.is_impersonating ? "impersonating" : null;',
    ],
    // Display and attribution readers of the session field.
    "src/components/admin/ImpersonationBanner.tsx": [
        "const isImpersonating = !!session?.user?.is_impersonating;",
        "if (!session?.user?.is_impersonating) {",
    ],
    "src/components/ask-dev/conversation/AskDevConversationContext.tsx": [
        'const impersonated = user.is_impersonating ? (user.impersonated_user_id ?? "unknown") : "";',
        "const impersonating = session?.user?.is_impersonating === true;",
    ],
    "src/components/ask-dev/useAskDevAvailability.ts": [
        'if (user?.is_impersonating) return "impersonating";',
    ],
    "src/app/(app)/cognitive-load/page.tsx": [
        "session.user.is_impersonating && session.user.impersonated_user_id",
    ],
    "src/lib/auth/platform/shadow.ts": [
        'const key = `${session.user.id}|${session.user.org_id ?? ""}|${session.user.is_impersonating === true}`;',
    ],
    "src/lib/auth/shadow/run.ts": [
        "isImpersonating: session.user.is_impersonating === true,",
        "impersonating: session.user.is_impersonating === true,",
    ],
    "src/lib/acr/service.ts": ["rawSession?.user.is_impersonating === true ||"],
    // resolveActiveOrgId: its input is built by the session callback from the accessor.
    "src/lib/impersonation.ts": [
        "is_impersonating?: boolean;",
        "if (user.is_impersonating && user.impersonated_org_id) {",
    ],
    // Backend status answer shapes (wire), never stored.
    "src/lib/impersonationStatusMemo.ts": [
        "is_impersonating: boolean;",
        "is_impersonating: boolean;",
        "is_impersonating: body.is_impersonating,",
    ],
    "src/lib/acr/ops.ts": [
        "const impersonationStatusSchema = z.object({ is_impersonating: z.boolean() }).loose();",
        "parsed.data.is_impersonating || input.sessionImpersonating || impersonatedToken;",
    ],
    "src/lib/admin/api/platform.ts": ["is_impersonating: boolean;"],
    "src/lib/admin/server/orgs.ts": ["is_impersonating: boolean;"],
};

const sorted = (lines: readonly string[]) => [...lines].sort();

describe("impersonation flag census (D6720)", () => {
    const files = walk("src");
    const found = Object.fromEntries(
        files.map((f) => [f, flagLines(f)] as const).filter(([, lines]) => lines.length > 0),
    );

    it("every line naming the flag or the delegated fields is listed, and no listed line is gone", () => {
        const actual = Object.fromEntries(
            Object.entries(found).map(([f, lines]) => [f, sorted(lines)]),
        );
        const expected = Object.fromEntries(
            Object.entries(ALLOWED).map(([f, lines]) => [f, sorted(lines)]),
        );
        expect(actual).toEqual(expected);
    });

    it("no stored flag on the JWT is read or written anywhere", () => {
        const stored = /\btoken\??\.is_impersonating\b|\btoken\[["']is_impersonating["']\]/;
        const hits = files.flatMap((f) =>
            readFileSync(path.join(ROOT, f), "utf8")
                .split("\n")
                .filter((line) => !isComment(line) && stored.test(line))
                .map((line) => `${f}: ${line.trim()}`),
        );
        expect(hits).toEqual([]);
    });

    it("the delegated token fields are read only in the accessor module", () => {
        const imp = /imp_access_token|imp_expires_at/;
        const owners = Object.entries(found)
            .filter(([, lines]) => lines.some((l) => imp.test(l)))
            .map(([f]) => f)
            .sort();
        expect(owners).toEqual([ACCESSOR, "src/types/next-auth.d.ts"]);
    });

    it("the session field is written once, from the accessor", () => {
        const auth = readFileSync(path.join(ROOT, "src/lib/auth.ts"), "utf8");
        const writes = files.flatMap((f) =>
            readFileSync(path.join(ROOT, f), "utf8")
                .split("\n")
                .filter((line) => /\.is_impersonating\s*=[^=]/.test(line))
                .map((line) => `${f}: ${line.trim()}`),
        );
        expect(writes).toEqual(["src/lib/auth.ts: session.user.is_impersonating = impersonating;"]);
        expect(auth).toContain("const impersonating = isImpersonatingToken(token);");
    });
});
