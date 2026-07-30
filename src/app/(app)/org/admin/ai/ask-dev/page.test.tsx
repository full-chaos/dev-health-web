import { render, screen } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/ask-dev/AskDevAdminPanel", () => ({
    AskDevAdminPanel: () => <section aria-label="Ask Dev controls">Ask Dev controls</section>,
}));
vi.mock("@/lib/admin/server", () => ({
    getAskDevAdmin: vi.fn(),
    getAskDevUsage: vi.fn(),
    runAskDevReadiness: vi.fn(),
    updateAskDevAdminSettings: vi.fn(),
}));

import AskDevAISetupPage from "./page";

describe("AskDevAISetupPage", () => {
    it("contains only the Ask Dev administration surface", () => {
        render(<AskDevAISetupPage />);

        expect(screen.getByRole("region", { name: "Ask Dev controls" })).toBeInTheDocument();
        expect(screen.queryByText(/BYO LLM/i)).not.toBeInTheDocument();
    });
});
