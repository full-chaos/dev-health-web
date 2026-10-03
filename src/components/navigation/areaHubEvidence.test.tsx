import { describe, expect, it, vi } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { render } from "@/test/utils";

import { AreaHub } from "./AreaHub";

import type { AreaSignal } from "@/lib/areaSignals/types";

import { areaHubFacts } from "./areaHubEvidence";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const sig = (
    id: string,
    cluster: string,
    state: AreaSignal["state"],
    value: string,
): AreaSignal => ({
    id,
    label: id,
    href: `/ai/${id}`,
    cluster,
    metricLabel: `${id} metric`,
    value,
    state,
});

describe("areaHubFacts (CHAOS-8091)", () => {
    const signals = [
        sig("impact", "Signal", "low", "40% AI-assisted"),
        sig("review", "Signal", "high", "2.4× amplification"),
        sig("risk", "Signal", "unavailable", ""),
        sig("auto", "Action", "neutral", "3 opportunities"),
    ];

    it("lists the signals in the order the hub draws them: cluster by cluster, severity inside, no data last", () => {
        expect(areaHubFacts(signals).map((fact) => fact.label)).toEqual([
            "review · review metric",
            "impact · impact metric",
            "risk · risk metric",
            "auto · auto metric",
        ]);
    });

    it("has no hero-first reordering: a critical card in a later group stays after the earlier group", () => {
        const labels = areaHubFacts([
            sig("s", "Signal", "low", "1"),
            sig("a", "Action", "critical", "9"),
        ]).map((fact) => fact.label);
        // The hub emphasises its top card in place; it does not move it to the top.
        expect(labels).toEqual(["s · s metric", "a · a metric"]);
    });

    it("gives the value and state as the card shows them, and no value for a signal with no data", () => {
        const facts = areaHubFacts(signals);
        expect(facts[0].value).toBe("2.4× amplification · High");
        expect(facts[2].value).toBeUndefined();
    });

    it("is the order the AreaHub draws its cards in: both read the one layout rule", () => {
        const mixed = [
            sig("a1", "Action", "low", "1"),
            sig("s1", "Signal", "unavailable", ""),
            sig("s2", "Signal", "critical", "9"),
            sig("a2", "Action", "high", "5"),
            sig("s3", "Signal", "low", "2"),
        ];
        const { container } = render(
            <AreaHub areaId="ai" signals={mixed} filters={defaultMetricFilter} />,
        );
        const drawn = Array.from(container.querySelectorAll("[data-signal-id]")).map((el) =>
            el.getAttribute("data-signal-id"),
        );
        const facts = areaHubFacts(mixed).map((fact) => String(fact.label).split(" · ")[0]);
        expect(facts).toEqual(drawn);
    });
});
