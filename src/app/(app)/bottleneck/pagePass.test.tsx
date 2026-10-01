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

    it("the two quadrants sit side by side from 1280 px and stack below", () => {
        const section = page.match(
            /<section className="([^"]*)" data-testid="bottleneck-quadrants">/u,
        );
        expect(section?.[1]).toContain("xl:grid-cols-2");
        expect(section?.[1]).not.toContain("min-[1150px]");
        const body = page.slice(
            page.indexOf('data-testid="bottleneck-quadrants"'),
            page.indexOf("Review wait density"),
        );
        expect(body.match(/<QuadrantPanel /gu)?.length).toBe(2);
    });

    it("the evidence cards use the token radii", () => {
        const s = read("components/work/EvidenceView.tsx");
        expect(s).not.toMatch(/rounded-(?:3xl|2xl)/u);
        expect(s).toContain("rounded-(--radius-md)");
    });

    it("has no raw palette class", () => {
        for (const f of [
            "app/(app)/bottleneck/page.tsx",
            "components/work/EvidenceView.tsx",
            "components/work/WipSaturationNotice.tsx",
        ]) {
            expect(read(f), f).not.toMatch(
                /\b(?:text|bg|border)-(?:amber|emerald|rose|red|green|blue)-\d{2,3}/u,
            );
        }
    });
});
