import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDiagnoseSignalsMock = vi.fn();
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/navigation/AreaOverview", () => ({ AreaOverview: () => null }));
vi.mock("@/lib/areaSignals/diagnose", () => ({
    getDiagnoseSignals: (...args: unknown[]) => getDiagnoseSignalsMock(...args),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/config", () => ({
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "true" }),
}));

import DiagnosePage from "./page";

describe("Diagnose Ask Dev entry point", () => {
    beforeEach(() => {
        getDiagnoseSignalsMock.mockReset().mockResolvedValue([]);
    });

    it("does not render a duplicate Ask Dev launcher", async () => {
        const ui = await DiagnosePage({
            searchParams: Promise.resolve({
                scope_type: "team",
                scope_id: "private-team-id",
                range_days: "30",
            }),
        });
        render(ui);

        expect(
            screen.queryByRole("button", { name: "Ask Dev about this" }),
        ).not.toBeInTheDocument();
    });

    it("renders the follow-a-question links after the area overview", async () => {
        const ui = await DiagnosePage({ searchParams: Promise.resolve({ role: "manager" }) });
        render(ui);
        const section = screen.getByTestId("diagnose-questions");
        expect(section).toBeInTheDocument();
        expect(section.querySelectorAll("a")).toHaveLength(3);
        expect(section.querySelector("a")?.getAttribute("href")).toContain("role=manager");
    });
});
