import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@playwright/test", () => ({ defineConfig: (config: unknown) => config }));

/**
 * A live impersonation session belongs to the superuser ACCOUNT, not to one token: while it is
 * live, every token of that account is scoped to the target's org (go-api policy.Scope
 * Impersonation reads the session by the admin's user id). The live specs share one superuser,
 * so a spec that starts a session must never run while another live spec runs: it gets its own
 * project, ordered after or before every other project by dependencies.
 */

type Project = {
    name: string;
    testMatch?: RegExp;
    testIgnore?: readonly RegExp[];
    dependencies?: readonly string[];
    fullyParallel?: boolean;
};
type LiveConfig = { testDir: string; projects: readonly Project[]; fullyParallel?: boolean };

const ROOT = path.resolve(__dirname, "../..");
const LIVE_DIR = path.join(ROOT, "tests/live");
const MODE_ENV = ["LIVE_WEB_DECISIONS", "LIVE_ASK_DEV", "LIVE_GUIDED_ONBOARDING"] as const;

function liveSpecs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "__tests__" ? [] : liveSpecs(full);
        return entry.name.endsWith(".spec.ts") ? [full] : [];
    });
}

const startsImpersonation = (file: string) =>
    /\/api\/v1\/admin\/impersonate`/u.test(readFileSync(file, "utf8"));

function matches(project: Project, file: string): boolean {
    if (project.testMatch && !project.testMatch.test(file)) return false;
    return !(project.testIgnore ?? []).some((ignore) => ignore.test(file));
}

function dependsOn(projects: readonly Project[], from: string, to: string): boolean {
    const seen = new Set<string>();
    const walk = (name: string): boolean => {
        if (seen.has(name)) return false;
        seen.add(name);
        const deps = projects.find((p) => p.name === name)?.dependencies ?? [];
        return deps.includes(to) || deps.some(walk);
    };
    return walk(from);
}

describe("live impersonation specs run alone (CHAOS-13327)", () => {
    const saved: Record<string, string | undefined> = {};
    let config: LiveConfig;

    beforeAll(async () => {
        for (const name of MODE_ENV) {
            saved[name] = process.env[name];
            delete process.env[name];
        }
        vi.resetModules();
        config = (await import("../../playwright.live.config")).default as unknown as LiveConfig;
    });

    afterAll(() => {
        for (const name of MODE_ENV) {
            if (saved[name] === undefined) delete process.env[name];
            else process.env[name] = saved[name];
        }
    });

    it("finds the impersonation spec", () => {
        const found = liveSpecs(LIVE_DIR).filter(startsImpersonation);
        expect(found.map((file) => path.relative(ROOT, file))).toContain(
            "tests/live/impersonation.spec.ts",
        );
    });

    it("gives each spec that starts a session a project of its own, ordered against every other", () => {
        const specs = liveSpecs(LIVE_DIR);
        const projects = config.projects;
        for (const spec of specs.filter(startsImpersonation)) {
            const owners = projects.filter((p) => matches(p, spec));
            expect(owners.map((p) => p.name)).toHaveLength(1);
            const owner = owners[0]!;
            const shared = specs.filter((other) => other !== spec && matches(owner, other));
            expect(shared.map((file) => path.relative(ROOT, file))).toEqual([]);
            expect(owner.fullyParallel ?? config.fullyParallel ?? false).toBe(false);
            for (const other of projects) {
                if (other.name === owner.name || !specs.some((file) => matches(other, file))) {
                    continue;
                }
                const ordered =
                    dependsOn(projects, owner.name, other.name) ||
                    dependsOn(projects, other.name, owner.name);
                expect({ project: other.name, ordered }).toEqual({
                    project: other.name,
                    ordered: true,
                });
            }
        }
    });
});
