import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";

import {
    formatBandLabel,
    formatQuality,
    formatWorkUnitIdToken,
    formatWorkUnitLabel,
    formatWorkUnitTypeLabel,
} from "@/lib/investment";
import type { WorkUnitInvestment } from "@/lib/types";

import { InvestmentEvidenceTable } from "./InvestmentEvidenceTable";

const unit: WorkUnitInvestment = {
    work_unit_id: "wu-1111-2222-3333",
    work_unit_name: "Login fix",
    work_unit_type: "pr",
    time_range: { start: "2026-02-01T00:00:00Z", end: "2026-03-01T00:00:00Z" },
    effort: { metric: "active_hours", value: 12 },
    investment: { themes: { feature_delivery: 1 }, subcategories: { "feature.build": 1 } },
    evidence_quality: { value: 0.7, band: "moderate" },
    evidence: {
        textual: [{ quote: "fixes the login bug", source_kind: "pr_title" }],
        structural: [{ repo: "org/app", file: "auth.ts" }],
        contextual: [{ team_hint: "payments", window_days: 14 }],
    },
};

const attribution = new Map([
    [
        "wu-1111-2222-3333",
        { source: "linked_issue", confidence: 0.8, teamName: "Payments" } as never,
    ],
]);

const draw = (onSelectWorkUnit = vi.fn()) => {
    render(
        <InvestmentEvidenceTable
            workUnits={[unit]}
            effortUnit="active hours"
            onSelectWorkUnit={onSelectWorkUnit}
            attributionByWorkUnit={attribution}
        />,
    );
    return onSelectWorkUnit;
};

describe("InvestmentEvidenceTable — row Evidence action (CHAOS-8566)", () => {
    it("has no expandable row: the group row is not a toggle", () => {
        draw();
        const row = screen.getByTestId("evidence-group-row");
        expect(row.tagName).toBe("DIV");
        expect(within(row).queryByRole("button", { name: "Feature Delivery" })).toBeNull();
        expect(within(row).getAllByRole("button")).toHaveLength(1);
        expect(row.querySelector("[aria-expanded]")).toBeNull();
    });

    it("the Evidence action opens the shared drawer with the group's served numbers", async () => {
        draw();
        fireEvent.click(screen.getByRole("button", { name: "Evidence: Feature Delivery" }));
        const facts = await screen.findByTestId("evidence-group-facts");
        expect(facts).toHaveTextContent("Feature Delivery");
        expect(facts).toHaveTextContent(formatQuality(0.7));
        expect(facts).toHaveTextContent("Units");
        expect(facts).toHaveTextContent("12 active hours");
    });

    it("the drawer shows every served field of the unit that the expansion showed", async () => {
        draw();
        fireEvent.click(screen.getByRole("button", { name: "Evidence: Feature Delivery" }));
        const drawer = await screen.findByRole("dialog");
        fireEvent.click(within(drawer).getByRole("button", { name: /Login fix/ }));

        const text = drawer.textContent ?? "";
        // The unit header and the detail head, from the same formatters the component uses.
        for (const expected of [
            formatWorkUnitLabel(unit),
            formatWorkUnitTypeLabel(unit),
            formatWorkUnitIdToken(unit.work_unit_id),
            `${formatQuality(0.7)} (${formatBandLabel("moderate")})`,
            "Payments",
            "Classification rationale",
            "Linked metadata",
        ]) {
            expect(text).toContain(String(expected));
        }
        // Every key and value of every evidence record (textual, structural, contextual).
        const records = [
            ...(unit.evidence?.textual ?? []),
            ...(unit.evidence?.structural ?? []),
            ...(unit.evidence?.contextual ?? []),
        ] as Array<Record<string, unknown>>;
        expect(records).toHaveLength(3);
        for (const record of records) {
            for (const [key, value] of Object.entries(record)) {
                const label = key
                    .replace(/[_-]/g, " ")
                    .replace(/([a-z])([A-Z])/g, "$1 $2")
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                expect(text).toContain(`${label}:`);
                expect(text).toContain(String(value));
            }
        }
    });

    it("a unit's Open evidence selects it for 'How this was calculated' and closes the drawer", async () => {
        const onSelect = draw();
        fireEvent.click(screen.getByRole("button", { name: "Evidence: Feature Delivery" }));
        const drawer = await screen.findByRole("dialog");
        fireEvent.click(within(drawer).getByRole("button", { name: /Login fix/ }));
        fireEvent.click(within(drawer).getByRole("button", { name: "Open evidence" }));
        expect(onSelect).toHaveBeenCalledWith("wu-1111-2222-3333");
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
