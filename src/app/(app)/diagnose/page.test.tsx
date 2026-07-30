import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDiagnoseSignalsMock = vi.fn();
vi.mock("@/components/filters/FilterBar", () => ({ FilterBar: () => null }));
vi.mock("@/components/navigation/GlobalContextBar", () => ({
    GlobalContextBar: () => null,
}));
vi.mock("@/components/navigation/AreaOverview", () => ({ AreaOverview: () => null }));
vi.mock("@/components/navigation/PrimaryNav", () => ({ PrimaryNav: () => null }));
vi.mock("@/components/shared/BackLink", () => ({ BackLink: () => null }));
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
});
