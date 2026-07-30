import { describe, expect, it } from "vitest";
import {
    AI_SETUP_PATHS,
    activeAISetupTab,
    resolveAISetupDefaultPath,
    visibleAISetupTabs,
} from "../aiSetup";

describe("AI Setup entitlement routing", () => {
    it.each([
        [{ ask_dev: true, byo_llm: false }, AI_SETUP_PATHS.askDev, ["Ask Dev"]],
        [{ ask_dev: false, byo_llm: true }, AI_SETUP_PATHS.byoLlm, ["BYO LLM"]],
        [{ ask_dev: true, byo_llm: true }, AI_SETUP_PATHS.askDev, ["Ask Dev", "BYO LLM"]],
        [{ ask_dev: false, byo_llm: false }, "/org/admin", []],
    ] as const)(
        "keeps independent decisions for %o",
        (features, expectedDefault, expectedLabels) => {
            expect(resolveAISetupDefaultPath(features)).toBe(expectedDefault);
            expect(visibleAISetupTabs(features).map((tab) => tab.label)).toEqual(expectedLabels);
        },
    );

    it("recognizes only stable child routes as active tabs", () => {
        expect(activeAISetupTab(AI_SETUP_PATHS.askDev)).toBe("ask-dev");
        expect(activeAISetupTab(AI_SETUP_PATHS.byoLlm)).toBe("byo-llm");
        expect(activeAISetupTab("/org/admin/ai")).toBeUndefined();
    });
});
