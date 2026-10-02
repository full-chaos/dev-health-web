import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** CHAOS-7761 pin: production strings and links of the Landscape page, read from source. */
const page = readFileSync(join(process.cwd(), "src/app/(app)/landscape/page.tsx"), "utf8").replace(
    /\s+/gu,
    " ",
);

describe("Landscape page strings (pin)", () => {
    it.each([
        'title="Landscape"',
        'subtitle="Operating modes across paired pressures, teams, repos, ownership, and hotspots."',
        "Individual landscapes are available from the individual view.",
        'title: "Cycle Time × Throughput"',
        'description: "Operating modes under time in flight and delivery pace."',
        'title: "Churn × Throughput"',
        'description: "Operating modes under change volume and delivery pace."',
        'emptyState="Quadrant data unavailable for this scope."',
        "chartHeight={420}",
        "chartHeight={320}",
        "<span>Bucket</span>",
        'withFilterParam("/landscape?bucket=week"',
        'withFilterParam("/landscape?bucket=month"',
        "CTA_LABELS.week",
        "CTA_LABELS.month",
        "CTA_LABELS.openEvidence",
        'ariaLabel="Landscape views"',
    ])("keeps %s", (text) => {
        expect(page).toContain(text);
    });
});
