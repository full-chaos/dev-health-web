import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BlockedWorkItemsTable } from "@/app/(app)/explore/BlockedWorkEvidence";
import { describeArtifact } from "@/components/charts/HeatmapPanel";
import { EntityLabel } from "@/components/labels/EntityLabel";
import { PersonEvidenceTable } from "@/components/people/PersonEvidenceTable";
import { NodeDetailPanel } from "@/components/work/GraphView";
import { ScopeBarFrame } from "@/components/shell/ScopeBarFrame";
import { SecurityRepoScopeBar } from "@/components/security/SecurityRepoScopeBar";
import {
    chartEntityLabel,
    resolveEntityLabel,
    resolveEntityLabels,
    scrubIdentifiers,
} from "@/lib/labels/entityLabel";
import { containsIdToken } from "@/lib/labels/idToken";

vi.mock("@/components/charts/HeatmapChart", () => ({ HeatmapChart: () => null }));
vi.mock("@/lib/graphql/hooks", () => ({}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org" }));
vi.mock("@/components/charts/WorkGraphExplorer", () => ({ WorkGraphExplorer: () => null }));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: vi.fn() }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/code",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Invented ids in the shapes the producers serve: a UUID, a 32-char hex id, a prefixed id, a
// path-like id, and a git commit hash.
const UUID = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";
const HEX32 = "3f2a9c1e7b4d4e8a9c215d6e7f8a9b0c";
const COMMIT = "9fceb02d0ae598e95dc970b74767f19372d61af8";
// Each text node alone: joined textContent would glue "#3f2a9c1e" to a badge word and hide the ID.
const visibleTexts = (root: Element): string[] => {
    const out: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n.textContent ?? "");
    return out;
};
const expectNoIdText = (root: Element) => {
    for (const text of visibleTexts(root)) expect(containsIdToken(text), text).toBe(false);
};

const expectNoIdAttrs = (root: Element) => {
    for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
        for (const attr of ["title", "aria-label", "placeholder", "alt"]) {
            const value = el.getAttribute(attr);
            if (value) expect(containsIdToken(value), `${attr}=${value}`).toBe(false);
        }
    }
};

const ID_SHAPES = [
    UUID,
    HEX32,
    `repo:${UUID}`,
    `org/${UUID}`,
    `team:${HEX32}`,
    `jira:${UUID}`,
    "gh:platform-team",
    "linear:ENG",
];

describe("containsIdToken", () => {
    it.each([
        UUID,
        HEX32,
        COMMIT,
        `#${UUID.slice(0, 8)}`,
        `repo·${UUID.slice(0, 8)}`,
        UUID.slice(0, 8),
    ])("flags %s", (text) => expect(containsIdToken(text)).toBe(true));
    it.each([`jira:${UUID}`, "gh:platform-team", "linear:ENG", "team:jira:abc"])(
        "flags %s",
        (text) => expect(containsIdToken(text)).toBe(true),
    );
    it.each(["web-app", "Pull request #42", "Unresolved", "Item 3", "Feature delivery", "Commit"])(
        "passes %s",
        (text) => expect(containsIdToken(text)).toBe(false),
    );
});

describe("label helpers never return an ID as a label", () => {
    it.each(ID_SHAPES)("resolveEntityLabel(%s) without a name", (id) => {
        expect(containsIdToken(resolveEntityLabel(id).label)).toBe(false);
        expect(
            containsIdToken(resolveEntityLabel(id, { unresolvedFallback: "Unresolved" }).label),
        ).toBe(false);
    });

    it.each(ID_SHAPES)("resolveEntityLabel(%s) with a name keeps the name", (id) => {
        expect(resolveEntityLabel(id, { name: "web-app" }).label).toBe("web-app");
    });

    it("resolveEntityLabels over mixed rows", () => {
        const { labels } = resolveEntityLabels([...ID_SHAPES, "web-app", null], (id, i) =>
            i % 2 ? { name: "named-repo" } : {},
        );
        for (const label of labels) expect(containsIdToken(label)).toBe(false);
    });

    it.each(ID_SHAPES)("chartEntityLabel(%s)", (id) => {
        expect(containsIdToken(chartEntityLabel(id))).toBe(false);
        expect(chartEntityLabel(id, { name: "web-app" })).toBe("web-app");
    });

    it("scrubIdentifiers leaves no ID in prose", () => {
        const { text } = scrubIdentifiers(`Risk appears elevated for ${UUID} and ${HEX32}`);
        expect(containsIdToken(text)).toBe(false);
    });

    it.each(ID_SHAPES)("EntityLabel(%s) shows no ID as text or tooltip", (id) => {
        const { container } = render(<EntityLabel id={id} />);
        expectNoIdText(container);
        expectNoIdAttrs(container);
        expect(container.textContent).toBe("Unresolved");
    });

    it.each(ID_SHAPES)("EntityLabel variant=text of a bare id %s", (id) => {
        const { container } = render(<EntityLabel id={id} variant="text" />);
        expectNoIdText(container);
    });
});

describe("describeArtifact rows", () => {
    const rows: Record<string, unknown>[] = [
        { path: UUID },
        { file_key: HEX32 },
        { commit_hash: COMMIT },
        { number: 42, repo_id: UUID },
        { number: 42, repo_id: UUID, title: "Fix login", repo_name: "web-app" },
        { work_item_id: UUID },
        { work_item_id: "PROJ-12" },
        { deployment_id: UUID },
        { name: UUID },
        { title: HEX32 },
        {},
    ];
    it.each(rows.map((row, i) => [i, row] as const))("row %i has no ID label", (_i, row) => {
        expect(containsIdToken(describeArtifact(row, 0).label)).toBe(false);
    });

    it("a served name wins", () => {
        expect(describeArtifact({ commit_hash: COMMIT, title: "Add retry" }, 0).label).toBe(
            "Add retry",
        );
        expect(describeArtifact({ work_item_id: UUID, title: "Slow build" }, 0).label).toBe(
            "Slow build",
        );
    });
});

describe("surfaces that print a label", () => {
    it.each(["prs", "issues"] as const)("PersonEvidenceTable %s rows with no name", (type) => {
        const items =
            type === "prs"
                ? [
                      { number: 7, repo_id: UUID, created_at: "2026-09-01T10:00:00Z" },
                      { repo_id: HEX32 },
                  ]
                : [{ work_item_id: UUID, provider: "jira", status: "done" }];
        const { container } = render(
            <PersonEvidenceTable type={type} items={items} fallbackHref="/people" />,
        );
        expectNoIdText(container);
        expectNoIdAttrs(container);
    });

    it("SecurityRepoScopeBar without a name shows no ID", () => {
        const { container } = render(<SecurityRepoScopeBar repoId={UUID} />);
        expectNoIdText(container);
        expectNoIdAttrs(container);
    });

    it("SecurityRepoScopeBar with a name shows the name", () => {
        const { container } = render(<SecurityRepoScopeBar repoId={UUID} name="web-app" />);
        expect(container.textContent).toContain("web-app");
    });
});

describe("fixed surfaces never show an id, as text or attribute (bare uuid and provider-keyed)", () => {
    const TEAM_IDS = [UUID, `jira:${UUID}`, "gh:platform-team", "linear:ENG"];

    it.each(TEAM_IDS)("BlockedWorkItemsTable team cell for team_id %s", (teamId) => {
        const { container } = render(
            <BlockedWorkItemsTable
                blockedIssues={{
                    count: 1,
                    items: [
                        {
                            work_item_id: "item",
                            provider: "jira",
                            status: "blocked",
                            team_id: teamId,
                            team_name: null,
                            cycle_time_hours: null,
                            lead_time_hours: null,
                            started_at: null,
                            completed_at: null,
                        },
                    ],
                }}
            />,
        );
        const cell = container.querySelectorAll("td")[3];
        expect(cell.textContent).toBe("Unresolved");
        expectNoIdAttrs(container);
    });

    it.each(TEAM_IDS)("ScopeBarFrame with the selected id %s that has no option", (id) => {
        const { container } = render(
            <ScopeBarFrame
                orgName="Test"
                repos={{ options: [], selected: [id], onChange: () => {} }}
                onReset={() => {}}
            />,
        );
        expectNoIdText(container);
        expectNoIdAttrs(container);
    });

    it.each(TEAM_IDS)("work graph node panel for the node id %s with no name", (id) => {
        const edge = {
            edgeId: "e1",
            sourceType: "PR",
            sourceId: id,
            targetType: "ISSUE",
            targetId: id,
            edgeType: "REFERENCES",
            provenance: "NATIVE",
            confidence: 1,
            evidence: null,
            repoId: null,
            provider: null,
        } as never;
        const { container } = render(
            <NodeDetailPanel
                node={{ id, type: "PR" } as never}
                incomingEdges={[edge]}
                outgoingEdges={[edge]}
                onClose={() => {}}
            />,
        );
        expectNoIdText(container);
        expectNoIdAttrs(container);
    });
});
