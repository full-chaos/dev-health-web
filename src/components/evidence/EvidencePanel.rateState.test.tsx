import { render, screen, waitFor } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";

import { EvidencePanel } from "./EvidencePanel";

const { mockGetExplainData } = vi.hoisted(() => ({ mockGetExplainData: vi.fn() }));

vi.mock("@/lib/api/home", () => ({ getExplainData: mockGetExplainData }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
}));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

// CHAOS-9043: the explain panel says why a rate has no value, never "Value 0 %".
const explain = (over: object) => ({
    metric: "change_failure_rate",
    label: "Change failure rate",
    unit: "%",
    value: 0,
    delta_pct: 0,
    drivers: [],
    contributors: [],
    drilldown_links: {},
    ...over,
});

const drawn = async (payload: object, metric = "change_failure_rate") => {
    mockGetExplainData.mockResolvedValue(payload);
    render(
        <EvidencePanel
            isOpen
            onCloseAction={() => undefined}
            title="Change failure rate"
            metric={metric}
            filters={filters}
        />,
    );
    await waitFor(() => expect(screen.getByTestId("evidence-metric-facts")).toBeInTheDocument());
    return screen.getByTestId("evidence-metric-facts");
};

beforeEach(() => mockGetExplainData.mockReset());

describe("explain panel rate state", () => {
    it("measured 25: value and change are rows", async () => {
        const facts = await drawn(
            explain({
                value: 25,
                delta_pct: -50,
                has_data: true,
                has_prior_data: true,
                rate_state: "measured",
            }),
        );
        expect(facts).toHaveTextContent("Value");
        expect(facts).toHaveTextContent("25 %");
        expect(facts).toHaveTextContent("-50");
    });

    it("measured 0 draws 0 as a value", async () => {
        const facts = await drawn(
            explain({
                value: 0,
                delta_pct: -100,
                has_data: true,
                has_prior_data: true,
                rate_state: "measured",
            }),
        );
        expect(facts).toHaveTextContent("0 %");
        expect(facts).not.toHaveTextContent("No ");
    });

    it("unknown_no_incident_evidence says why, no 0 %", async () => {
        const facts = await drawn(
            explain({
                has_data: false,
                has_prior_data: true,
                rate_state: "unknown_no_incident_evidence",
            }),
        );
        expect(facts).toHaveTextContent("No incident data for this window");
        expect(facts).not.toHaveTextContent("0 %");
        expect(facts).not.toHaveTextContent("Change");
    });

    it("not_applicable_no_deployments says why", async () => {
        const facts = await drawn(
            explain({
                has_data: false,
                has_prior_data: true,
                rate_state: "not_applicable_no_deployments",
            }),
        );
        expect(facts).toHaveTextContent("No deployments in this window");
        expect(facts).not.toHaveTextContent("0 %");
    });

    it("null state with no data says No data for this window", async () => {
        const facts = await drawn(explain({ has_data: false, rate_state: null }));
        expect(facts).toHaveTextContent("No data for this window");
        expect(facts).not.toHaveTextContent("0 %");
    });

    it("an unknown future state never prints the raw state", async () => {
        const facts = await drawn(explain({ has_data: false, rate_state: "something_new" }));
        expect(facts).toHaveTextContent("No data for this window");
        expect(facts).not.toHaveTextContent("something_new");
    });

    it("revert_rate says Not measured yet", async () => {
        const facts = await drawn(
            explain({ metric: "revert_rate", has_data: false, has_prior_data: false }),
            "revert_rate",
        );
        expect(facts).toHaveTextContent("Not measured yet");
        expect(facts).not.toHaveTextContent("0 %");
    });

    it("fields absent (API before this change): the value row is drawn as before", async () => {
        const facts = await drawn(explain({ value: 4.2, delta_pct: -3 }));
        expect(facts).toHaveTextContent("4.2 %");
        expect(facts).toHaveTextContent("-3");
        expect(facts).not.toHaveTextContent("Incident link");
    });

    it.each([
        ["native", "Native link"],
        ["explicit_text", "Named in text, not a native link"],
        ["heuristic", "Inferred by heuristic, not a native link"],
    ])("link_tier %s is named in plain words", async (tier, words) => {
        const facts = await drawn(
            explain({
                value: 25,
                delta_pct: -50,
                has_data: true,
                has_prior_data: true,
                rate_state: "measured",
                link_tier: tier,
            }),
        );
        expect(facts).toHaveTextContent("Incident link");
        expect(facts).toHaveTextContent(words);
        if (tier !== "native") expect(facts).toHaveTextContent("not a native link");
    });

    it("an unknown link_tier is not drawn", async () => {
        const facts = await drawn(
            explain({
                value: 25,
                has_data: true,
                rate_state: "measured",
                link_tier: "constructor",
            }),
        );
        expect(facts).not.toHaveTextContent("Incident link");
    });
});
