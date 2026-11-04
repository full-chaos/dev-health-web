import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// A client role array or superuser flag read. Comment lines are skipped.
const ROLE_READ = /\bis_superuser\b|\bisSuperuser\b|\.role\b/;
const isComment = (line: string) => /^\s*(\/\/|\/\*|\*)/.test(line);
const roleReadLines = (text: string) =>
    text
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => !isComment(line) && ROLE_READ.test(line))
        .map(({ n }) => n);

const walk = (rel: string, match: (name: string) => boolean): string[] => {
    const abs = path.join(ROOT, rel);
    const out: string[] = [];
    for (const name of readdirSync(abs)) {
        const child = `${rel}/${name}`;
        if (name === "__tests__" || name === "node_modules") continue;
        if (statSync(path.join(ROOT, child)).isDirectory()) out.push(...walk(child, match));
        else if (match(name)) out.push(child);
    }
    return out;
};

const DECIDED = [
    "src/lib/admin/server/_shared.ts",
    "src/app/(app)/org/admin/integrations/github-app/install/route.ts",
    "src/app/(app)/org/admin/integrations/github-app/callback/route.ts",
];

// Every remaining client role read in the scanned tree, each with its reason. A new unlisted read
// fails; a listed file that no longer reads fails too.
const READ_ALLOWLIST: Readonly<Record<string, string>> = {
    "src/lib/billing/actions/_shared.ts":
        "S3 resolveOrgId: the cross-org superuser rule has no catalog action (CHAOS-11847); the API enforces",
    "src/app/(app)/superadmin/billing/audit/actions.ts":
        "S4 triggerReconciliation: the flag only decides whether a missing org is an error",
    "src/app/api/agent-context/context-packets/route.ts":
        "S5 response shaping: the flag keeps a debug summary in the browser packet, it grants no access",
    "src/app/api/auth/change-password/route.ts":
        "copies the claims of a token pair into the session, no decision",
    "src/app/api/auth/switch-org/route.ts":
        "copies the claims of a token pair into the session, no decision",
};

// Guards that keep the client superuser rule even when the switch is on, each with its reason.
const UNMAPPED_USE: Readonly<Record<string, { count: number; reason: string }>> = {
    "src/lib/admin/server/orgs.ts": {
        count: 3,
        reason: "S8 impersonation start, stop and status: 7.11 owns them, and a platform admin must always be able to stop",
    },
    "src/lib/admin/server/billing.ts": {
        count: 7,
        reason: "licensing overrides and flags: no catalog action exists (CHAOS-11847)",
    },
};

describe("A2 no client role array is the final authority in the decided files", () => {
    it.each(DECIDED)("%s has no role or superuser read", (file) => {
        expect(roleReadLines(read(file))).toEqual([]);
    });

    it("the decided files call the decision, not an inline rule", () => {
        expect(read(DECIDED[0] as string)).toMatch(/decideGuard\(/);
        expect(read(DECIDED[1] as string)).toMatch(
            /decideGuard\(\s*session,\s*"org\.integrations\.write"/,
        );
        expect(read(DECIDED[2] as string)).toMatch(
            /decideGuard\(\s*session,\s*"org\.integrations\.write"/,
        );
    });
});

describe("A2 the remaining client role reads are listed", () => {
    const scanned = [
        ...walk("src/lib/admin/server", (n) => n.endsWith(".ts")),
        ...walk("src/lib/billing/actions", (n) => n.endsWith(".ts")),
        ...walk("src/app/api", (n) => n === "route.ts"),
        ...walk("src/app/(app)", (n) => n === "actions.ts" || n === "route.ts"),
    ];
    const reading = scanned
        .filter((file) => !DECIDED.includes(file))
        .filter((file) => roleReadLines(read(file)).length > 0)
        .sort();

    it("scans a plausible number of files", () => {
        expect(scanned.length).toBeGreaterThan(20);
    });

    it("lists every read", () => {
        expect(reading).toEqual(Object.keys(READ_ALLOWLIST).sort());
    });

    it.each(Object.entries(READ_ALLOWLIST))("%s has a reason", (_file, reason) => {
        expect(reason.length).toBeGreaterThan(10);
    });
});

describe("A2 the unmapped guard is used only where listed", () => {
    const files = walk("src", (n) => n.endsWith(".ts") || n.endsWith(".tsx"));
    const used = new Map<string, number>();
    for (const file of files) {
        if (file.startsWith("src/lib/auth/decide/")) continue;
        const hits = read(file).match(/guard: "superuser\.unmapped"/g)?.length ?? 0;
        if (hits > 0) used.set(file, hits);
    }

    it("matches the list", () => {
        expect(Object.fromEntries([...used].sort())).toEqual(
            Object.fromEntries(
                Object.entries(UNMAPPED_USE)
                    .map(([file, row]) => [file, row.count] as const)
                    .sort(),
            ),
        );
    });
});
