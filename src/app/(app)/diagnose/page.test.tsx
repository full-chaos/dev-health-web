import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const askDevTriggerMock = vi.fn();
const getDiagnoseSignalsMock = vi.fn();

vi.mock("@/components/ask-dev/AskDevTrigger", () => ({
    AskDevTrigger: ({ context }: { context: unknown }) => {
        askDevTriggerMock(context);
        return <button type="button">Ask Dev about this</button>;
    },
}));
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
        askDevTriggerMock.mockReset();
        getDiagnoseSignalsMock.mockReset().mockResolvedValue([]);
    });

    it("passes only an approved route, controlled questions, and an opaque filter fingerprint", async () => {
        const ui = await DiagnosePage({
            searchParams: Promise.resolve({
                scope_type: "team",
                scope_id: "private-team-id",
                range_days: "30",
            }),
        });
        render(ui);

        expect(screen.getByRole("button", { name: "Ask Dev about this" })).toBeInTheDocument();
        expect(askDevTriggerMock).toHaveBeenCalledOnce();
        expect(askDevTriggerMock).toHaveBeenCalledWith({
            routeId: "diagnose_overview",
            entityRefs: [],
            filterFingerprint: expect.stringMatching(/^filter-v1-[a-f0-9]{8}$/),
            suggestedQuestionIds: ["delivery_status", "observed_change", "data_trust"],
        });
        expect(JSON.stringify(askDevTriggerMock.mock.calls)).not.toContain("private-team-id");
    });
});
