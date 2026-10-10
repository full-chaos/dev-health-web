/** CHAOS-9110: the Explore tile and "Read the signal" for each of the four served inputs. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { cleanup, screen } from "@/test/utils";
import {
    DELTA_INPUTS,
    FROM_ZERO_TEXT,
    NO_DATA_TEXT,
    NO_PRIOR_TEXT,
} from "@/lib/metrics/__tests__/deltaInputs.fixtures";

vi.mock("@/components/evidence/EvidencePanel", () => ({ EvidencePanel: () => null }));
vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: async () => ({ data: { id: "o1", name: "Full Chaos" } }),
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/explore",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div /> }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({ HorizontalBarChart: () => <div /> }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));

const explain = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/api/home", () => ({
    getExplainOutcome: async () => ({ data: explain.value, noView: false }),
    getHomeData: async () => null,
}));
vi.mock("@/lib/api/investment", () => ({
    getDrilldown: async () => null,
    getBlockedWorkIssues: async () => ({ items: [], count: 0 }),
}));

import Explore from "./page";

afterEach(cleanup);

describe("Explore reads the no-data flags", () => {
    for (const metric of ["churn_loc", "blocked_work"]) {
        for (const input of DELTA_INPUTS) {
            it(`${metric}: ${input.name}`, async () => {
                explain.value = {
                    metric,
                    label: metric,
                    unit: "loc",
                    value: input.value,
                    delta_pct: input.delta_pct,
                    has_data: input.has_data,
                    has_prior_data: input.has_prior_data,
                    drivers: [],
                    contributors: [],
                    drilldown_links: {},
                };
                render(await Explore({ searchParams: Promise.resolve({ metric }) }));
                const text = screen.getByTestId("explore-metric-tile").textContent ?? "";
                expect(text).not.toMatch(/Not reported|0%|NaN|null/);
                if (input.state === "no-data") {
                    // No value: the served 0 is a placeholder, never drawn as "0 loc".
                    expect(text).toContain(NO_DATA_TEXT);
                    expect(text).not.toMatch(/(^|\s)0\s*loc/i);
                } else if (input.state === "from-zero") expect(text).toMatch(FROM_ZERO_TEXT);
                else expect(text).toContain(NO_PRIOR_TEXT);
            });
        }
    }
});
