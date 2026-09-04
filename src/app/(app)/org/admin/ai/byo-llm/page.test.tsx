import { render, screen } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/llm/ByoLlmSettings", () => ({
    ByoLlmSettings: () => <section>BYO provider settings</section>,
}));
vi.mock("@/components/admin/llm/ByoLlmSpendSummary", () => ({
    ByoLlmSpendSummary: () => <section>BYO spend summary</section>,
}));
vi.mock("@/components/admin/llm/ByoLlmErrorStates", () => ({
    ByoLlmErrorStates: () => <section>BYO error guidance</section>,
}));
vi.mock("@/lib/admin/server", () => ({
    deleteLLMSettings: vi.fn(),
    getLLMBudget: vi.fn(),
    getLLMSettings: vi.fn(),
    getLLMSettingsStatus: vi.fn(),
    getLLMSpendSummary: vi.fn(),
    runLLMSettingsReadiness: vi.fn(),
    upsertLLMSettings: vi.fn(),
}));

import ByoLlmAISetupPage from "./page";

describe("ByoLlmAISetupPage", () => {
    it("contains only BYO provider, budget, spend, and error guidance", () => {
        render(<ByoLlmAISetupPage />);

        expect(screen.getByText("BYO provider settings")).toBeInTheDocument();
        expect(screen.getByText("BYO spend summary")).toBeInTheDocument();
        expect(screen.getByText("BYO error guidance")).toBeInTheDocument();
        expect(screen.queryByText(/Ask Dev controls/i)).not.toBeInTheDocument();
    });
});
