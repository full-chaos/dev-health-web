import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-7749 pin: the production strings of the Bottlenecks page, read from source
 * (the page is an async server page that needs a session and a backend). The page
 * pass moves markup; none of these strings or links may change.
 */
const page = readFileSync(join(process.cwd(), "src/app/(app)/bottleneck/page.tsx"), "utf8").replace(
    /\s+/gu,
    " ",
);

describe("Bottlenecks page strings (pin)", () => {
    it.each([
        'title="Bottlenecks"',
        'subtitle="WIP saturation, review latency, and blocked work in one view."',
        "Where work is piling up and review is slowing delivery.",
        'title="WIP × Throughput"',
        'description="Operating modes under work in flight and delivery pace."',
        'title="Review Load × Review Latency"',
        'description="Operating modes under review demand and turnaround."',
        'emptyState="WIP saturation data will appear once work items are ingested."',
        'emptyState="Review load data will appear once PR data is ingested."',
        'title="Review wait density"',
        'emptyState="Review wait heatmap will appear once PR data is ingested."',
        'caption="Work in progress"',
        'caption="Blocked items"',
        'caption="Time to first review"',
    ])("keeps %s", (text) => {
        expect(page).toContain(text);
    });

    it("keeps both quadrant panels, each with the Explore work link", () => {
        expect(page.match(/<QuadrantPanel /gu)?.length).toBe(2);
        expect(page.match(/label: "Explore work"/gu)?.length).toBe(2);
    });
});
