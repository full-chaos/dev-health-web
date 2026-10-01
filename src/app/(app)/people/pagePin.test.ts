import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-7762 pin: the production strings and links of the three People pages, read from
 * source (async server pages). The page pass moves markup and applies decisions P1-P4;
 * the strings below must stay (the ones that decisions change are listed in pagePass.test).
 */
const read = (p: string) =>
    readFileSync(join(process.cwd(), "src/app/(app)", p), "utf8").replace(/\s+/gu, " ");

const SEARCH = read("people/page.tsx");
const PERSON = read("people/[person_id]/page.tsx");
const METRIC = read("people/[person_id]/metrics/[metric]/page.tsx");

describe("People search page strings (pin)", () => {
    it.each([
        'subtitle="Individual metrics for a single-person view."',
        "Select an individual to investigate.",
        "Data service unavailable. Search results may be delayed until the API is back.",
        "<PeopleSearch",
        'view="people"',
    ])("keeps %s", (text) => {
        expect(SEARCH).toContain(text);
    });
});

describe("Person page strings (pin)", () => {
    it.each([
        'subtitle="This view is scoped to one person."',
        "Select a metric to investigate.",
        "Inactive",
        "Data service unavailable. Metrics will refresh once the API is back.",
        'caption="Open metric"',
        'title="Churn × Throughput landscape"',
        'description="Operating mode for the selected window in individual scope."',
        'emptyState="Quadrant landscape unavailable."',
        "Narrative",
        "Evidence-linked",
        "Narrative insights will appear once data is ingested.",
        "Identity mapping",
        "Attribution accuracy reflects linked accounts.",
        "Freshness",
        "Freshness details pending.",
        "Work mix",
        "Categories",
        "Work mix data unavailable.",
        "Flow breakdown",
        "Stages",
        "Flow stage detail unavailable.",
        "Collaboration",
        "Counts only",
        "Collaboration counts pending.",
        "identityCoverage < 70",
    ])("keeps %s", (text) => {
        expect(PERSON).toContain(text);
    });

    it("links every tile to the metric page of that metric", () => {
        expect(PERSON).toContain("`/people/${personId}/metrics/${delta.metric}`");
    });
});

describe("Person metric page strings (pin)", () => {
    it.each([
        "Data service unavailable. Evidence will refresh once the API is back.",
        "Definition",
        "Definition will appear when the indicator library is available.",
        "How to interpret:",
        "Timeseries",
        'title="Active hours distribution"',
        "See when work concentrates across weekdays and hours.",
        'emptyState="Active hours heatmap unavailable."',
        "Associations",
        "Association statements will appear once data is ingested.",
        "Choose PRs or Issues to review evidence.",
        "Evidence rows will appear once data is ingested.",
        "By repo",
        "By work type",
        "By stage",
        "No breakdown data.",
        "CTA_LABELS.issues",
    ])("keeps %s", (text) => {
        expect(METRIC).toContain(text);
    });
});

describe("People search component strings (pin)", () => {
    const search = readFileSync(
        join(process.cwd(), "src/components/people/PeopleSearch.tsx"),
        "utf8",
    ).replace(/\s+/gu, " ");
    it.each([
        "People search",
        "Find an individual to view their personal metrics and evidence.",
        "Searching people...",
        "Unable to load people right now.",
        "No matches yet. Try another spelling or handle.",
        "No matches for the selected team filter.",
        "No matches for the selected people filter.",
        "Team filter applied. Search by name/handle to refine results.",
        "Select a team or search by name/handle to find someone.",
        "limit: 20",
        "Open",
    ])("keeps %s", (text) => {
        expect(search).toContain(text);
    });
});
