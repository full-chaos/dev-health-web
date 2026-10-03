import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/utils";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";

const hook = vi.hoisted(() => ({
    state: { loading: false, refetch: vi.fn() },
    lastOptions: undefined as unknown,
}));

vi.mock("@/lib/graphql/hooks", () => ({
    useCapacityForecast: (options: unknown) => {
        hook.lastOptions = options;
        return hook.state;
    },
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-ctx" }));

import { RefreshForecastButton } from "./RefreshForecastButton";

const filters: MetricFilter = {
    ...defaultMetricFilter,
    scope: { level: "team", ids: ["team-a", "team-b"] },
    time: { ...defaultMetricFilter.time, range_days: 60 },
};

beforeEach(() => {
    hook.state = { loading: false, refetch: vi.fn() };
});

describe("RefreshForecastButton", () => {
    it("refetches the forecast when clicked", async () => {
        render(<RefreshForecastButton filters={filters} orgId="org-1" />);

        await userEvent.click(screen.getByRole("button", { name: "Refresh Forecast" }));

        expect(hook.state.refetch).toHaveBeenCalledTimes(1);
    });

    it("asks for the same forecast as the view: every selected team id, range as history days, same org", () => {
        render(<RefreshForecastButton filters={filters} orgId="org-1" />);

        expect(hook.lastOptions).toEqual({
            orgId: "org-1",
            input: { teamIds: ["team-a", "team-b"], historyDays: 60 },
        });
    });

    it("falls back to the org of the provider", () => {
        render(<RefreshForecastButton filters={filters} />);

        expect((hook.lastOptions as { orgId: string }).orgId).toBe("org-ctx");
    });

    it("shows Computing... and is disabled while the forecast runs", () => {
        hook.state = { ...hook.state, loading: true };
        render(<RefreshForecastButton filters={filters} orgId="org-1" />);

        const button = screen.getByRole("button", { name: "Computing..." });
        expect(button).toBeDisabled();
    });
});
