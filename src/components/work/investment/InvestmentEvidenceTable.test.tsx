import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";

import { formatNumber } from "@/lib/formatters";
import {
    formatBandLabel,
    formatQuality,
    formatWorkUnitIdToken,
    formatWorkUnitLabel,
    formatWorkUnitTypeLabel,
    selectWorkUnitEntries,
} from "@/lib/investment";
import type { WorkUnitInvestment } from "@/lib/types";
import type { WorkUnitTeamAttribution } from "@/lib/graphql/__generated__/types";

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
        contextual: [
            {
                team_hint: "payments",
                window_days: 14,
                issues: ["jira:API-1", "jira:AUTH-1"],
                scope: { repo: "org/app", depth: 2 },
            },
        ],
    },
};

const second: WorkUnitInvestment = {
    ...unit,
    work_unit_id: "wu-4444-5555-6666",
    work_unit_name: "Logout fix",
    effort: { metric: "active_hours", value: 5 },
};

const attribution = new Map<string, WorkUnitTeamAttribution>([
    [
        "wu-1111-2222-3333",
        {
            workUnitId: "wu-1111-2222-3333",
            teamId: "team-payments",
            teamName: "Payments",
            source: "LINKED_ISSUE",
            confidence: "HIGH",
            isPrimary: true,
            memberCount: 2,
            evidence: "linked issue donor",
        },
    ],
]);

const table = (
    onSelectWorkUnit: (id: string) => void,
    attributionByWorkUnit?: Map<string, WorkUnitTeamAttribution>,
) => (
    <InvestmentEvidenceTable
        workUnits={[unit, second]}
        effortUnit="active hours"
        onSelectWorkUnit={onSelectWorkUnit}
        attributionByWorkUnit={attributionByWorkUnit}
    />
);

const draw = (onSelectWorkUnit = vi.fn()) => {
    render(table(onSelectWorkUnit, attribution));
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
        // The subject heading names the group once; the facts do not repeat it.
        expect(screen.getByTestId("evidence-subject")).toHaveTextContent("Feature Delivery");
        expect(facts).not.toHaveTextContent("Feature Delivery");
        expect(facts).toHaveTextContent(formatQuality(0.7));
        expect(facts).toHaveTextContent(/Units\s*2/);
        expect(facts).toHaveTextContent("17 active hours");
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
        expect(records.some((r) => Object.values(r).some((v) => Array.isArray(v)))).toBe(true);
        expect(
            records.some((r) =>
                Object.values(r).some((v) => v && !Array.isArray(v) && typeof v === "object"),
            ),
        ).toBe(true);
        // Each unit shows its OWN effort (not the group total of 17), from the same entries.
        const entries = selectWorkUnitEntries({
            focusSubcategory: null,
            workUnits: [unit, second],
            fallbackToAll: true,
        });
        const own = entries.find((entry) => entry.unit.work_unit_id === unit.work_unit_id)!;
        expect(own.weightedEffort).toBe(12);
        expect(text).toContain(`${formatNumber(own.weightedEffort)} active hours`);
        const other = entries.find((entry) => entry.unit.work_unit_id === second.work_unit_id)!;
        expect(text).toContain(`${formatNumber(other.weightedEffort)} active hours`);
        for (const record of records) {
            for (const [key, value] of Object.entries(record)) {
                const label = key
                    .replace(/[_-]/g, " ")
                    .replace(/([a-z])([A-Z])/g, "$1 $2")
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                expect(text).toContain(`${label}:`);
                // A list or an object value is drawn as JSON, as the entry card does.
                const shown =
                    value !== null && typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value);
                expect(text).toContain(shown);
            }
        }
    });

    it("the open drawer is live: a team badge that arrives after it opened shows without reopening", async () => {
        const onSelect = vi.fn();
        const view = render(table(onSelect, undefined));
        fireEvent.click(screen.getByRole("button", { name: "Evidence: Feature Delivery" }));
        const drawer = await screen.findByRole("dialog");
        expect(within(drawer).queryByTestId("team-attribution-badge")).toBeNull();

        view.rerender(table(onSelect, attribution));

        expect(await within(drawer).findAllByTestId("team-attribution-badge")).not.toHaveLength(0);
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
