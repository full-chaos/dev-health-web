import { existsSync, readFileSync } from "node:fs";
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

    it("the server page imports only components from its client modules (CHAOS-8070)", () => {
        // A plain value exported from a "use client" module reaches a server component as a client
        // reference, not as the value: `BOTTLENECK_TILES.map` threw "is not a function" at runtime
        // while every unit test passed. Values live in plain modules (./tiles.ts).
        const raw = read("app/(app)/bottleneck/page.tsx");
        for (const match of raw.matchAll(/import \{([^}]*)\} from "\.\/([^"]+)";/gu)) {
            const base = `app/(app)/bottleneck/${match[2]}`;
            const file = [".tsx", ".ts"]
                .map((ext) => base + ext)
                .find((f) => existsSync(join(process.cwd(), "src", f)));
            expect(file, base).toBeDefined();
            const source = read(file as string);
            if (!/^["']use client["']/u.test(source)) continue;
            for (const name of match[1]
                .split(",")
                .map((n) => n.trim())
                .filter(Boolean)) {
                expect(name, `${name} from ./${match[2]}`).toMatch(/^[A-Z][a-z]/u);
            }
        }
    });

    it("has no raw palette class", () => {
        for (const f of [
            "app/(app)/bottleneck/page.tsx",
            "app/(app)/bottleneck/BottleneckTiles.tsx",
            "app/(app)/bottleneck/tiles.ts",
            "components/work/WipSaturationNotice.tsx",
        ]) {
            expect(read(f), f).not.toMatch(
                /\b(?:text|bg|border)-(?:amber|emerald|rose|red|green|blue)-\d{2,3}/u,
            );
        }
    });
});
