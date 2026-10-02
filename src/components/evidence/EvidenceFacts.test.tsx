import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";

import { EvidenceProvenanceFacts, PROVENANCE_NOT_REPORTED } from "./EvidenceFacts";

const rows = () =>
    screen
        .getAllByTestId("evidence-fact")
        .map((row) => [row.querySelector("dt")?.textContent, row.querySelector("dd")?.textContent]);

describe("EvidenceProvenanceFacts", () => {
    it("shows ONE muted line in place of five empty rows when a drawer asks for it and nothing is served", () => {
        render(<EvidenceProvenanceFacts whenEmpty="line" />);

        expect(screen.getByTestId("evidence-provenance-not-reported")).toHaveTextContent(
            PROVENANCE_NOT_REPORTED,
        );
        expect(PROVENANCE_NOT_REPORTED).toBe("Provenance is not reported for this item.");
        expect(screen.queryByTestId("evidence-facts")).toBeNull();
        expect(screen.queryAllByTestId("evidence-fact")).toHaveLength(0);
    });

    it.each([
        ["source", { source: "home API" }, ["Source", "home API"]],
        ["quality", { quality: "high" }, ["Data quality", "High"]],
        ["last sync", { lastSync: "nightly batch" }, ["Last sync", "nightly batch"]],
        ["identity confidence", { identityConfidence: 0 }, ["Identity confidence", "0%"]],
        ["an empty artifact list", { artifactCount: 0 }, ["Artifacts", "None returned"]],
        ["an artifact count", { artifactCount: 3 }, ["Artifacts", "3 artifacts"]],
    ] as const)(
        "shows the five rows as soon as %s is served, the others as 'Not reported'",
        (_name, served, expected) => {
            render(<EvidenceProvenanceFacts whenEmpty="line" {...served} />);

            expect(screen.queryByTestId("evidence-provenance-not-reported")).toBeNull();
            const all = rows();
            expect(all.map(([label]) => label)).toEqual([
                "Source",
                "Data quality",
                "Last sync",
                "Identity confidence",
                "Artifacts",
            ]);
            expect(all).toContainEqual([...expected]);
            expect(all.filter(([, value]) => value === "Not reported")).toHaveLength(4);
        },
    );

    it("keeps the five rows for the explain-backed drawer (the default), also when nothing is served", () => {
        render(<EvidenceProvenanceFacts />);

        expect(screen.queryByTestId("evidence-provenance-not-reported")).toBeNull();
        expect(rows()).toEqual([
            ["Source", "Not reported"],
            ["Data quality", "Not reported"],
            ["Last sync", "Not reported"],
            ["Identity confidence", "Not reported"],
            ["Artifacts", "Not reported"],
        ]);
    });
});
