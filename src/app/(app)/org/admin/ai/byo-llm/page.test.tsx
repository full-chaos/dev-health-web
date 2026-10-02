import { render, screen } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";

vi.mock("next/navigation", () => ({
    usePathname: () => "/org/admin/ai/byo-llm",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

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

    // CHAOS-7591: the page brings the shared admin header (the AI Setup layout is gone).
    it('has one h1 "AI Setup", the Organization row with AI Setup marked, then the AI Setup views', () => {
        render(
            <AdminTierProvider tier="enterprise" features={{ byo_llm: true }}>
                <ByoLlmAISetupPage />
            </AdminTierProvider>,
        );

        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("AI Setup");
        expect(
            screen.getByText("Manage organization-owned model provider settings."),
        ).toBeInTheDocument();
        const organization = screen.getByRole("tablist", { name: "Organization views" });
        const views = screen.getByRole("tablist", { name: "AI Setup views" });
        expect(screen.getByRole("tab", { name: "AI Setup" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(organization.compareDocumentPosition(views)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
});
