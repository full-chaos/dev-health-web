import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { PARENT_SUBJECT_HINT_SOURCE, SUBJECT_KIND_VOCABULARY } from "../conversation";
import {
    APPROVED_ROUTE_IDS,
    MAX_PAGE_CONTEXT_REFS,
    PAGE_CONTEXT_HINT_SOURCE,
    PAGE_CONTEXT_ROUTES,
    SCOPE_KINDS,
    SUBJECT_KIND_ROLE,
    proposePageContext,
    routeIdForPath,
    toSubjectHints,
    type ApprovedRouteId,
} from "../page-context";
import { isAskDevExcludedPath } from "../surface";

/** Every page of the signed-in app, as its App Router pattern, read from the file system. */
function appPagePatterns(): string[] {
    const root = join(process.cwd(), "src/app/(app)");
    const patterns: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.name === "page.tsx") {
                const route = relative(root, dir)
                    .split("/")
                    // A route group `(name)` is not a URL segment.
                    .filter((segment) => segment !== "" && !/^\(.*\)$/u.test(segment));
                patterns.push(`/${route.join("/")}`);
            }
        }
    };
    walk(root);
    return patterns.sort();
}

/** A concrete path for a pattern: each dynamic segment gets a sample id. */
const examplePath = (pattern: string) => pattern.replace(/\[[^\]]+\]/gu, "sample-id-1");

const APP_PAGES = appPagePatterns();
const REGISTERED = new Map(
    APPROVED_ROUTE_IDS.flatMap((id) => PAGE_CONTEXT_ROUTES[id].paths.map((path) => [path, id])),
);
const EVIDENCE_KINDS = SUBJECT_KIND_VOCABULARY.filter(
    (kind) => SUBJECT_KIND_ROLE[kind] === "evidence",
);

describe("page-context registry: enumerated (plan §2.4, CHAOS-11936)", () => {
    it("reads the app's pages (fail closed on an empty walk)", () => {
        expect(APP_PAGES.length).toBeGreaterThan(50);
        expect(APP_PAGES).toContain("/issues/[issue_id]");
    });

    it("classifies every ACR subject kind exactly once; the scope kinds are the six V1 direct scopes", () => {
        expect(Object.keys(SUBJECT_KIND_ROLE).sort()).toEqual([...SUBJECT_KIND_VOCABULARY].sort());
        expect([...SCOPE_KINDS].sort()).toEqual([
            "organization",
            "project",
            "pull_request",
            "repository",
            "team",
            "work_item",
        ]);
        expect(EVIDENCE_KINDS.sort()).toEqual([
            "ci_pipeline_run",
            "decision",
            "deployment",
            "document",
            "episode",
            "incident",
            "metric",
            "pull_request_review",
            "work_item_ref",
        ]);
    });

    it.each(APPROVED_ROUTE_IDS)(
        "%s: real pages, mapped back to itself, never excluded, scope kinds only",
        (id) => {
            const entry = PAGE_CONTEXT_ROUTES[id];
            expect(entry.paths.length).toBeGreaterThan(0);
            expect(entry.kinds.length).toBeGreaterThan(0);
            for (const path of entry.paths) {
                expect(APP_PAGES).toContain(path);
                expect(routeIdForPath(examplePath(path))).toBe(id);
                expect(isAskDevExcludedPath(examplePath(path))).toBe(false);
            }
            for (const kind of entry.kinds) expect(SUBJECT_KIND_ROLE[kind]).toBe("scope");
            expect(new Set(entry.kinds).size).toBe(entry.kinds.length);
        },
    );

    it.each(APP_PAGES.filter((page) => !REGISTERED.has(page)))(
        "%s is not an approved route: no context",
        (page) => {
            expect(routeIdForPath(examplePath(page))).toBeNull();
            expect(
                proposePageContext({
                    pathname: examplePath(page),
                    entityRefs: [{ kind: "repository", id: "repository:1", label: "web" }],
                }),
            ).toBeNull();
        },
    );

    it("keeps supporting-evidence pages out (CHAOS-3216): deployment and person detail", () => {
        expect(routeIdForPath("/deployments/dep-1")).toBeNull();
        expect(routeIdForPath("/people/person-1")).toBeNull();
        expect(routeIdForPath("/superadmin/context-fabric/validation")).toBeNull();
    });

    it.each(EVIDENCE_KINDS)(
        "no route takes the evidence-only kind %s, and it never reaches a hint",
        (kind) => {
            for (const id of APPROVED_ROUTE_IDS) {
                expect(PAGE_CONTEXT_ROUTES[id].kinds).not.toContain(kind);
                const proposal = proposePageContext({
                    pathname: examplePath(PAGE_CONTEXT_ROUTES[id].paths[0]!),
                    entityRefs: [{ kind, id: `${kind}:1`, label: "Evidence" }],
                });
                expect(proposal?.entityRefs).toEqual([]);
                expect(proposal?.dropped).toEqual([{ kind, reason: "evidence_only" }]);
                expect(toSubjectHints(proposal!)).toEqual([]);
            }
        },
    );
});

describe("proposePageContext", () => {
    const issue = { kind: "work_item", id: "work_item:linear:1", label: "TEAMA-12" };

    it("proposes the route's own entity as a hint", () => {
        const proposal = proposePageContext({ pathname: "/issues/abc", entityRefs: [issue] });
        expect(proposal).toEqual({ routeId: "work_item_detail", entityRefs: [issue], dropped: [] });
        expect(toSubjectHints(proposal!)).toEqual([
            {
                kind: "work_item",
                id: "work_item:linear:1",
                label: "TEAMA-12",
                source: PAGE_CONTEXT_HINT_SOURCE,
            },
        ]);
    });

    it("drops a scope kind the route does not take", () => {
        const proposal = proposePageContext({
            pathname: "/complexity",
            entityRefs: [
                { kind: "team", id: "team:1", label: "Team A" },
                { kind: "repository", id: "repository:1", label: "web" },
            ],
        });
        expect(proposal?.entityRefs).toEqual([
            { kind: "repository", id: "repository:1", label: "web" },
        ]);
        expect(proposal?.dropped).toEqual([{ kind: "team", reason: "not_for_route" }]);
    });

    it("drops an unknown kind", () => {
        const proposal = proposePageContext({
            pathname: "/diagnose",
            entityRefs: [{ kind: "person", id: "person:1", label: "Someone" }],
        });
        expect(proposal?.entityRefs).toEqual([]);
        expect(proposal?.dropped).toEqual([{ kind: "person", reason: "unknown_kind" }]);
    });

    it.each([
        ["a blank id", { kind: "repository", id: " ​", label: "web" }],
        ["a blank label", { kind: "repository", id: "repository:1", label: "\t" }],
        ["an id over 256 characters", { kind: "repository", id: "r".repeat(257), label: "web" }],
        [
            "a label over 512 characters",
            { kind: "repository", id: "repository:1", label: "w".repeat(513) },
        ],
        [
            "a control character in the id",
            { kind: "repository", id: "repository:\u00001", label: "web" },
        ],
        [
            "a control character in the label",
            { kind: "repository", id: "repository:1", label: "we\nb" },
        ],
    ])("drops %s", (_name, ref) => {
        const proposal = proposePageContext({ pathname: "/diagnose", entityRefs: [ref] });
        expect(proposal?.entityRefs).toEqual([]);
        expect(proposal?.dropped).toEqual([{ kind: "repository", reason: "invalid_ref" }]);
    });

    it("keeps a ref at the exact bounds", () => {
        const ref = { kind: "repository", id: "r".repeat(256), label: "w".repeat(512) };
        expect(
            proposePageContext({ pathname: "/diagnose", entityRefs: [ref] })?.entityRefs,
        ).toEqual([ref]);
    });

    it("collapses duplicates and keeps at most MAX_PAGE_CONTEXT_REFS", () => {
        const refs = Array.from({ length: MAX_PAGE_CONTEXT_REFS + 3 }, (_, n) => ({
            kind: "repository",
            id: `repository:${String(n)}`,
            label: `repo ${String(n)}`,
        }));
        const proposal = proposePageContext({
            pathname: "/diagnose",
            entityRefs: [refs[0]!, refs[0]!, ...refs],
        });
        expect(proposal?.entityRefs).toEqual(refs.slice(0, MAX_PAGE_CONTEXT_REFS));
        expect(proposal?.dropped).toEqual([
            { kind: "repository", reason: "duplicate" },
            { kind: "repository", reason: "duplicate" },
            ...refs
                .slice(MAX_PAGE_CONTEXT_REFS)
                .map(() => ({ kind: "repository", reason: "over_limit" })),
        ]);
    });

    it("builds hints field by field: nothing else from the page reaches ACR", () => {
        const smuggled = {
            kind: "repository",
            id: "repository:1",
            label: "web",
            filter: { team: "a" },
            text: "page text",
            source: "forged",
        };
        const proposal = proposePageContext({ pathname: "/diagnose", entityRefs: [smuggled] });
        expect(proposal?.entityRefs).toEqual([
            { kind: "repository", id: "repository:1", label: "web" },
        ]);
        const [hint] = toSubjectHints(proposal!);
        expect(Object.keys(hint!).sort()).toEqual(["id", "kind", "label", "source"]);
        expect(hint!.source).toBe(PAGE_CONTEXT_HINT_SOURCE);
    });

    it("names its hints apart from a follow-up's parent hints, within ACR's source bound", () => {
        expect(PAGE_CONTEXT_HINT_SOURCE).not.toBe(PARENT_SUBJECT_HINT_SOURCE);
        expect(PAGE_CONTEXT_HINT_SOURCE.length).toBeGreaterThan(0);
        expect(PAGE_CONTEXT_HINT_SOURCE.length).toBeLessThanOrEqual(64);
    });

    it.each(["/issues", "/issues/a/b", "/diagnose/unknown", "", "/", "/DIAGNOSE"])(
        "matches whole segments only: %j has no route",
        (pathname) => {
            expect(routeIdForPath(pathname)).toBeNull();
        },
    );

    it("ignores a trailing slash", () => {
        expect(routeIdForPath("/diagnose/")).toBe<ApprovedRouteId>("diagnose_overview");
    });
});
