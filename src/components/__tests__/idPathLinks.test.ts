import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeArtifact } from "@/components/charts/HeatmapPanel";
import { repoSelectionHref } from "@/lib/onboarding/setupSurface";

/**
 * CHAOS-9117: links to a dynamic route that the table test (rowLinkContract) does not cover.
 *
 * - The href holds the id encoded (`:` -> `%3A`, `/` -> `%2F`): a raw `:` makes the Next.js router
 *   prefetch the link again without limit (CHAOS-9105).
 * - A link that can appear many times in one view (evidence rows, people cards, run history) has
 *   `prefetch={false}`.
 */
const SRC = join(process.cwd(), "src");

describe("hrefs hold the id encoded", () => {
    it("PR evidence link: repo id and number in one encoded segment", () => {
        const artifact = describeArtifact({ repo_id: "org/repo", number: 12 }, 0);
        expect(artifact.link).toBe("/prs/org%2Frepo%3A12");
    });

    it("work item evidence link", () => {
        const artifact = describeArtifact({ work_item_id: "jira:CHAOS-1" }, 0);
        expect(artifact.link).toBe("/issues/jira%3ACHAOS-1");
    });

    it("sync config edit link of the first-run flow", () => {
        expect(repoSelectionHref("custom:cfg")).toBe("/org/admin/sync/custom%3Acfg/edit");
        expect(repoSelectionHref(null)).not.toContain("%3A");
    });
});

/** Files whose dynamic `<Link>` repeats in one view; each such link needs `prefetch={false}`. */
const REPEATED_LINK_FILES: Record<string, number> = {
    "app/(app)/explore/page.tsx": 1, // only the `flameHref` link has an id; the other links are fixed paths
    "components/charts/HeatmapPanel.tsx": 1,
    "components/people/PeopleSearch.tsx": 1,
    "components/admin/sync/SyncJobHistory.tsx": 1,
    "components/product-telemetry/PlatformProductTelemetryDashboard.tsx": 1,
};

describe.each(Object.entries(REPEATED_LINK_FILES))("%s", (file, expected) => {
    it(`has ${expected} dynamic link(s), each with prefetch off`, () => {
        const source = readFileSync(join(SRC, file), "utf8");
        const tags = source
            .split(/<Link(?=\s)/u)
            .slice(1)
            .map((chunk) => /^[\s\S]*?\n\s*>/u.exec(chunk)?.[0] ?? chunk)
            .filter((tag) => /\bhref=\{(?!["'])/u.test(tag))
            .filter((tag) => !file.startsWith("app/(app)/explore") || tag.includes("flameHref"));
        expect(tags).toHaveLength(expected);
        for (const tag of tags) expect(tag).toContain("prefetch={false}");
    });
});
