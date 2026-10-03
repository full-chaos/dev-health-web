import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { WipSaturationNotice } from "@/components/work/WipSaturationNotice";

const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const page = read("app/(app)/bottleneck/page.tsx").replace(/\s+/gu, " ");

describe("Bottlenecks page pass (CHAOS-7749)", () => {
    it("the WIP note is a page-load Notice info with the production sentence", () => {
        const { container } = render(<WipSaturationNotice />);
        const notice = container.querySelector('[data-notice-variant="info"]');
        expect(notice).not.toBeNull();
        expect(notice).not.toHaveAttribute("role");
        expect(
            screen.getByText(
                "WIP Saturation is indexed to a baseline of 100% (work in progress matched to typical throughput). Readings above 100% mean more work is open than the team usually clears in the window — e.g. 950% reads as ~9.5× the baseline, not a data error. Sustained readings far above 100% point to over-commitment, and the metric is intentionally uncapped so that severity stays visible.",
            ),
        ).toBeInTheDocument();
    });

    it("the page renders the note component and no longer holds the loose paragraph", () => {
        expect(page).toContain("<WipSaturationNotice />");
        expect(page).not.toContain("WIP Saturation is indexed to a baseline");
    });

    it("one quadrant now (CHAOS-8070): Review Load × Review Latency, full width; no WIP × Throughput", () => {
        expect(page.match(/<QuadrantPanel /gu)?.length).toBe(1);
        expect(page).toContain('title="Review Load × Review Latency"');
        expect(page).not.toContain('data-testid="bottleneck-quadrants"');
        expect(page).not.toContain('type: "wip_throughput"');
    });

    it("the legacy evidence cards are gone (CHAOS-8070): no EvidenceView, no Blocked Associations", () => {
        expect(page).not.toContain("EvidenceView");
        expect(page).not.toContain("Blocked Associations");
    });

    it("has no raw palette class", () => {
        for (const f of [
            "app/(app)/bottleneck/page.tsx",
            "app/(app)/bottleneck/BottleneckTiles.tsx",
            "components/work/WipSaturationNotice.tsx",
        ]) {
            expect(read(f), f).not.toMatch(
                /\b(?:text|bg|border)-(?:amber|emerald|rose|red|green|blue)-\d{2,3}/u,
            );
        }
    });
});
