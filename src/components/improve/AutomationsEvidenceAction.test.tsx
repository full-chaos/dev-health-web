import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";

const hook = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("@/lib/graphql/hooks/useImproveOpportunities", () => ({
    useImproveOpportunities: () => ({ data: hook.data }),
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/improve/automations",
    useSearchParams: () => new URLSearchParams(),
}));

import { AutomationsEvidenceAction } from "./AutomationsEvidenceAction";

const opp = (kind: string) => ({ kind });

beforeEach(() => {
    hook.data = {
        improveOpportunities: {
            detectorReady: true,
            totalCount: 3,
            opportunities: [opp("HIGH_CHURN"), opp("HIGH_CHURN"), opp("LOW_THROUGHPUT")],
        },
    };
});

describe("AutomationsEvidenceAction", () => {
    it("lists the tile counts: detected signals and one count per kind", async () => {
        render(<AutomationsEvidenceAction />);

        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
        const rows = within(await screen.findByTestId("page-evidence-facts"))
            .getAllByTestId("evidence-fact")
            .map((row) => [
                row.querySelector("dt")?.textContent,
                row.querySelector("dd")?.textContent,
            ]);
        expect(rows).toEqual([
            ["Detected signals", "3"],
            ["High churn", "2"],
            ["Low throughput", "1"],
        ]);
    });

    it("draws nothing when the detector is not ready (no count is made up)", () => {
        hook.data = {
            improveOpportunities: { detectorReady: false, totalCount: 0, opportunities: [] },
        };
        render(<AutomationsEvidenceAction />);

        expect(screen.queryByRole("button", { name: "View evidence" })).toBeNull();
    });
});
