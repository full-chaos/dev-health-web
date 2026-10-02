import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { DIAGNOSE_HOME_METRIC } from "@/lib/areaSignals/diagnoseHomeMetric";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { DiagnoseSignalFacts, diagnoseEvidenceSubject } from "./diagnoseEvidence";

const filters = defaultMetricFilter;

const signal = (over: Partial<AreaSignal> & Pick<AreaSignal, "id">): AreaSignal => ({
    label: over.id,
    href: `/${over.id}`,
    metricLabel: `${over.id} metric`,
    value: "1",
    state: "low",
    ...over,
});

const SIGNALS: AreaSignal[] = [
    signal({
        id: "flow",
        label: "Flow",
        metricLabel: "Deploy frequency",
        value: "16",
        state: "medium",
    }),
    signal({
        id: "investment",
        label: "Investment",
        metricLabel: "Planned allocation",
        value: "Feature Delivery 62%",
        state: "neutral",
    }),
    signal({
        id: "code",
        label: "Code",
        metricLabel: "Code churn",
        value: "1,320,441",
        state: "critical",
    }),
    signal({
        id: "landscape",
        label: "Landscape",
        metricLabel: "Bus factor",
        value: "",
        state: "unavailable",
    }),
    signal({
        id: "complexity",
        label: "Complexity",
        metricLabel: "Avg complexity",
        value: "121.3",
        state: "high",
    }),
];

describe("diagnoseEvidenceSubject (the 'View evidence' subject of the Diagnose overview)", () => {
    it("is the explain metric of the primary signal when that signal is a home metric", () => {
        expect(diagnoseEvidenceSubject(SIGNALS, filters, "em")).toEqual({
            title: "Code churn",
            metric: "churn",
            filters,
            role: "em",
        });
    });

    it("follows the severity rule: the most severe available signal, not a fixed one", () => {
        const flowFirst = SIGNALS.map((s) =>
            s.id === "code"
                ? { ...s, state: "low" as const }
                : s.id === "flow"
                  ? { ...s, state: "critical" as const }
                  : s,
        );
        expect(diagnoseEvidenceSubject(flowFirst, filters)).toMatchObject({
            title: "Deploy frequency",
            metric: "deploy_freq",
        });
        const wip = [
            signal({
                id: "bottleneck",
                label: "Bottlenecks",
                metricLabel: "WIP saturation",
                value: "468%",
                state: "high",
            }),
        ];
        expect(diagnoseEvidenceSubject(wip, filters)).toMatchObject({ metric: "wip_saturation" });
    });

    it("names the same home metrics as the resolver", () => {
        expect(DIAGNOSE_HOME_METRIC).toEqual({
            flow: "deploy_freq",
            code: "churn",
            bottleneck: "wip_saturation",
        });
    });

    it("lists the page's signals when the primary signal has no home metric", () => {
        const complexityFirst = SIGNALS.filter((s) => s.id !== "code");
        const subject = diagnoseEvidenceSubject(complexityFirst, filters, "em");
        expect(subject.title).toBe("Diagnose");
        expect("metric" in subject).toBe(false);
        expect("content" in subject).toBe(true);
    });

    it("lists the page's signals when no signal has data (never an invented metric)", () => {
        const none = [signal({ id: "code", value: "", state: "unavailable" })];
        const subject = diagnoseEvidenceSubject(none, filters);
        expect(subject.title).toBe("Diagnose");
        expect("metric" in subject).toBe(false);
    });
});

describe("DiagnoseSignalFacts", () => {
    it("shows each signal's served value and state, most severe first, with the legacy caption", () => {
        render(<DiagnoseSignalFacts signals={SIGNALS} />);
        expect(screen.getByText("Diagnostic sub-areas, ordered by severity.")).toBeInTheDocument();
        const rows = within(screen.getByTestId("diagnose-signal-fact-list")).getAllByTestId(
            "evidence-fact",
        );
        expect(rows.map((row) => row.textContent)).toEqual([
            "Code · Code churn1,320,441 · Critical",
            "Complexity · Avg complexity121.3 · High",
            "Flow · Deploy frequency16 · Medium",
            "Investment · Planned allocationFeature Delivery 62% · Info",
            "Landscape · Bus factorNot reported",
        ]);
    });

    it("shows 'Not reported' for a signal with no data, never a value", () => {
        render(<DiagnoseSignalFacts signals={SIGNALS} />);
        const rows = screen.getAllByTestId("evidence-fact");
        const landscape = rows.find((row) => row.textContent?.startsWith("Landscape"));
        expect(landscape).toHaveAttribute("data-reported", "false");
        expect(landscape).toHaveTextContent("Not reported");
    });
});
