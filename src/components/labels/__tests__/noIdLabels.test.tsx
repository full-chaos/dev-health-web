import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { describeArtifact } from "@/components/charts/HeatmapPanel";
import { EntityLabel } from "@/components/labels/EntityLabel";
import { PersonEvidenceTable } from "@/components/people/PersonEvidenceTable";
import { SecurityRepoScopeBar } from "@/components/security/SecurityRepoScopeBar";
import {
    chartEntityLabel,
    resolveEntityLabel,
    resolveEntityLabels,
    scrubIdentifiers,
} from "@/lib/labels/entityLabel";
import { containsIdToken } from "@/lib/labels/idToken";

vi.mock("@/components/charts/HeatmapChart", () => ({ HeatmapChart: () => null }));
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

const ID_SHAPES = [UUID, HEX32, `repo:${UUID}`, `org/${UUID}`, `team:${HEX32}`];

describe("containsIdToken", () => {
    it.each([
        UUID,
        HEX32,
        COMMIT,
        `#${UUID.slice(0, 8)}`,
        `repo·${UUID.slice(0, 8)}`,
        UUID.slice(0, 8),
    ])("flags %s", (text) => expect(containsIdToken(text)).toBe(true));
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

    it.each(ID_SHAPES)("EntityLabel(%s) shows no ID, keeps it in the tooltip", (id) => {
        const { container } = render(<EntityLabel id={id} />);
        expectNoIdText(container);
        expect(container.querySelector("[title]")?.getAttribute("title")).toBe(id);
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
    });

    it("SecurityRepoScopeBar without a name shows no ID", () => {
        const { container } = render(<SecurityRepoScopeBar repoId={UUID} />);
        expectNoIdText(container);
    });

    it("SecurityRepoScopeBar with a name shows the name", () => {
        const { container } = render(<SecurityRepoScopeBar repoId={UUID} name="web-app" />);
        expect(container.textContent).toContain("web-app");
    });
});
