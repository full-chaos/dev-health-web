import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";

import { EvidenceProvenanceFacts } from "./EvidenceFacts";

const rows = () =>
    screen
        .queryAllByTestId("evidence-fact")
        .map((row) => [row.querySelector("dt")?.textContent, row.querySelector("dd")?.textContent]);

describe("EvidenceProvenanceFacts", () => {
    it("draws nothing when nothing is served: no row, no 'Not reported', no note", () => {
        const { container } = render(<EvidenceProvenanceFacts />);

        expect(container).toBeEmptyDOMElement();
    });

    it("draws nothing for null fields (the shape a producer sends for 'unknown')", () => {
        const { container } = render(
            <EvidenceProvenanceFacts source={null} quality={null} lastSync={null} />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it.each([
        ["source", { source: "home API" }, ["Source", "home API"]],
        ["quality", { quality: "high" }, ["Data quality", "High"]],
        ["last sync", { lastSync: "nightly batch" }, ["Last sync", "nightly batch"]],
        ["an empty artifact list", { artifactCount: 0 }, ["Artifacts", "None returned"]],
        ["an artifact count", { artifactCount: 3 }, ["Artifacts", "3 artifacts"]],
    ] as const)(
        "draws only the %s row when only that field is served",
        (_name, served, expected) => {
            render(<EvidenceProvenanceFacts {...served} />);

            expect(rows()).toEqual([[...expected]]);
            expect(screen.queryByText("Not reported")).toBeNull();
        },
    );

    it("never draws an Identity confidence row", () => {
        render(<EvidenceProvenanceFacts source="home API" quality="high" artifactCount={1} />);

        expect(screen.queryByText("Identity confidence")).toBeNull();
    });
});
