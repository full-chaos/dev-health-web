import { render } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

const byoProps = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));

vi.mock("next/navigation", () => ({
    usePathname: () => "/org/admin/ai/byo-llm",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/admin/llm/ByoLlmSettings", () => ({
    ByoLlmSettings: (props: Record<string, unknown>) => {
        byoProps.current = props;
        return <section>BYO provider settings</section>;
    },
}));
vi.mock("@/components/admin/llm/ByoLlmPurposeOverrides", () => ({
    ByoLlmPurposeOverrides: () => <section>BYO purpose models</section>,
}));
vi.mock("@/components/admin/llm/ByoLlmSpendSummary", () => ({
    ByoLlmSpendSummary: () => <section>BYO spend summary</section>,
}));
vi.mock("@/components/admin/llm/ByoLlmOwnModelToggle", () => ({
    ByoLlmOwnModelToggle: () => <section>Own model toggle</section>,
}));
vi.mock("@/components/admin/llm/ByoLlmAiFeaturesToggle", () => ({
    ByoLlmAiFeaturesToggle: () => <section>ACR AI features toggle</section>,
}));
vi.mock("@/components/admin/llm/ByoLlmErrorStates", () => ({
    ByoLlmErrorStates: () => <section>BYO error guidance</section>,
}));
vi.mock("@/lib/admin/server", () => ({
    deleteLLMPurpose: vi.fn(),
    deleteLLMSettings: vi.fn(),
    getLLMBudget: vi.fn(),
    getLLMSettings: vi.fn(),
    getLLMSettingsStatus: vi.fn(),
    getLLMSpendSummary: vi.fn(),
    getOwnModelSetting: vi.fn(),
    getServiceModelSetting: vi.fn(),
    runLLMSettingsReadiness: vi.fn(),
    setOwnModelSetting: vi.fn(),
    setServiceModelSetting: vi.fn(),
    upsertLLMPurpose: vi.fn(),
    upsertLLMSettings: vi.fn(),
}));

import ByoLlmAISetupPage from "./page";

describe("ByoLlmAISetupPage model picker", () => {
    it("turns the picker on with the browser read and passes no list Server Action", () => {
        render(<ByoLlmAISetupPage />);

        expect(byoProps.current?.modelPicker).toBe(true);
        expect(byoProps.current?.loadModelsAction).toBeUndefined();
    });
});
