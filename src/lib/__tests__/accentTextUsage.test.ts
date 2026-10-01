import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CHAOS ticket 1.6: orange TEXT on selection states and eyebrows uses `--accent-text`
// (darker in light, so it reads on cards and tints). `--accent` stays for fills, borders and
// rings. This scan covers the files the ticket changed.
const ACCENT_TEXT_FILES = [
    "shared/FilterPills.tsx",
    "filters/sections/ToolbarActions.tsx",
    "filters/sections/QuickFilterMenu.tsx",
    "admin/sync/config-form/StepProgress.tsx",
    "admin/integrations/wizard/AddProviderStepProgress.tsx",
    "admin/integrations/wizard/ProviderSelectStep.tsx",
    "admin/sync/config-form/InitialDepthSection.tsx",
    "settings/PreferencesSettings.tsx",
    "cognitive-load/CognitiveLoadViews.tsx",
    "admin/integrations/wizard/AuthMethodStep.tsx",
    "admin/settings/billing/ChangePlanDialog.tsx",
    "home/CockpitSummary.tsx",
    "home/SignalCard.tsx",
    "home/CockpitClient.tsx",
    "billing/UpgradeGate.tsx",
    "admin/llm/ByoLlmSpendSummary.tsx",
    "admin/llm/ByoLlmSettings.tsx",
    "navigation/AreaSignalCard.tsx",
];

// `text-(--accent)` left on purpose in those files, with the reason. A new one fails the test.
// (Hover colours such as `hover:text-(--accent)` on action buttons are ticket 1.7 and not matched.)
const ALLOWED: Record<string, number> = {
    "admin/sync/config-form/InitialDepthSection.tsx": 1, // a link: ticket 1.7 (action = teal)
    "billing/UpgradeGate.tsx": 1, // tier-name emphasis, not clearly selection or eyebrow: asked
};

const EXACT = /(?<![\w:-])text-\(--accent\)(?![\w-])/gu;

describe("accent text usage", () => {
    it.each(ACCENT_TEXT_FILES)("%s uses --accent-text for selection and eyebrow text", (file) => {
        const source = readFileSync(new URL(`../../components/${file}`, import.meta.url), "utf8");
        expect((source.match(EXACT) ?? []).length).toBe(ALLOWED[file] ?? 0);
    });

    it("ships the Tailwind mapping for the token", () => {
        const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
        expect(css).toContain("--color-accent-text: var(--accent-text);");
    });
});
