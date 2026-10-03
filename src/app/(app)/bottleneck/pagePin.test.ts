import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-7749 pin: the production strings of the Bottlenecks page, read from source
 * (the page is an async server page that needs a session and a backend). The page
 * pass moves markup; none of these strings or links may change.
 *
 * CHAOS-8070 (prototype view 27) removed three blocks the prototype does not draw; their strings
 * left this pin on purpose, and their content stays reachable:
 * - the line "Where work is piling up and review is slowing delivery." under the subtitle (the
 *   subtitle says the same; the header now carries "View evidence");
 * - the "WIP × Throughput" quadrant: it is the Throughput tab quadrant on Flow
 *   (`/metrics?tab=throughput`, metricTabs.ts), with the same `wip_throughput` data;
 * - the WIP and Blocked association cards (EvidenceView): the WIP associations are meter rows on
 *   this page, and the WIP and Blocked Work drawers list the drivers and lead to their evidence pages.
 */
const page = readFileSync(join(process.cwd(), "src/app/(app)/bottleneck/page.tsx"), "utf8").replace(
    /\s+/gu,
    " ",
);

describe("Bottlenecks page strings (pin)", () => {
    it.each([
        'title="Bottlenecks"',
        'subtitle="WIP saturation, review latency, and blocked work in one view."',
        'title="Review Load × Review Latency"',
        'description="Operating modes under review demand and turnaround."',
        'emptyState="Review load data will appear once PR data is ingested."',
        'title="Review wait density"',
        'emptyState="Review wait heatmap will appear once PR data is ingested."',
    ])("keeps %s", (text) => {
        expect(page).toContain(text);
    });

    it("keeps the tile captions (now in the tile strip component)", () => {
        const tiles = readFileSync(
            join(process.cwd(), "src/app/(app)/bottleneck/BottleneckTiles.tsx"),
            "utf8",
        );
        for (const caption of ["Work in progress", "Blocked items", "Time to first review"]) {
            expect(tiles).toContain(`caption: "${caption}"`);
        }
    });

    it("keeps the one prototype quadrant with the Explore work link (CHAOS-8070)", () => {
        expect(page.match(/<QuadrantPanel /gu)?.length).toBe(1);
        expect(page.match(/label: "Explore work"/gu)?.length).toBe(1);
        expect(page).not.toContain('title="WIP × Throughput"');
    });
});
