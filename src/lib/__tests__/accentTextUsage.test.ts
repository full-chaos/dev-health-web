import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CHAOS ticket 1.6: orange TEXT on selection states and eyebrows uses `--accent-text`
// (darker in light, so it reads on cards and tints). `--accent` stays for fills, borders and
// rings. This scan covers the files the ticket changed.
const ACCENT_TEXT_FILES = [
    "components/shared/FilterPills.tsx",
    "components/filters/sections/ToolbarActions.tsx",
    "components/filters/sections/QuickFilterMenu.tsx",
    "components/admin/sync/config-form/StepProgress.tsx",
    "components/admin/integrations/wizard/AddProviderStepProgress.tsx",
    "components/admin/integrations/wizard/ProviderSelectStep.tsx",
    "components/admin/sync/config-form/InitialDepthSection.tsx",
    "components/settings/PreferencesSettings.tsx",
    "components/cognitive-load/CognitiveLoadViews.tsx",
    "components/admin/integrations/wizard/AuthMethodStep.tsx",
    "components/admin/settings/billing/ChangePlanDialog.tsx",
    "components/home/CockpitSummary.tsx",
    "components/home/SignalCard.tsx",
    "components/home/CockpitClient.tsx",
    "components/billing/UpgradeGate.tsx",
    "components/admin/llm/ByoLlmSpendSummary.tsx",
    "components/admin/llm/ByoLlmSettings.tsx",
    "components/navigation/AreaSignalCard.tsx",
    // Text badges and emphasis: contrast is the reason, not meaning (ruling).
    "components/admin/users/UserTable.tsx",
    "components/evidence/EvidenceContext.tsx",
    "app/(app)/superadmin/orgs/[id]/page.tsx",
    "app/(app)/code/page.tsx",
    "app/(app)/data-health/_components/AliasSuggestionRow.tsx",
];

// No `text-(--accent)` is left on purpose in these files (links moved to the action color, ticket 1.7).
const ALLOWED: Record<string, number> = {};

const EXACT = /(?<![\w:-])text-\(--accent\)(?![\w-])/gu;

describe("accent text usage", () => {
    it.each(ACCENT_TEXT_FILES)("%s uses --accent-text for selection and eyebrow text", (file) => {
        const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
        expect((source.match(EXACT) ?? []).length).toBe(ALLOWED[file] ?? 0);
    });

    it("ships the Tailwind mapping for the token", () => {
        const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
        expect(css).toContain("--color-accent-text: var(--accent-text);");
    });
});
