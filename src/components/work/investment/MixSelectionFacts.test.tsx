import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { MixSelectionFacts } from "./MixSelectionFacts";

const draw = (over: Partial<Parameters<typeof MixSelectionFacts>[0]> = {}) =>
    render(
        <MixSelectionFacts
            testId="facts"
            themeLabel="Quality"
            value={25}
            total={100}
            unit="work units"
            {...over}
        />,
    );

describe("MixSelectionFacts (one component for the treemap cell and the table row)", () => {
    it("prints the served effort with its unit, the share of the mix, and no quality row", () => {
        draw();
        const facts = screen.getByTestId("facts");
        expect(facts).toHaveTextContent("Quality");
        expect(facts).toHaveTextContent("25 work units");
        expect(facts).toHaveTextContent("25%");
        expect(facts).not.toHaveTextContent(/evidence quality/i);
    });

    it("a total of 0 prints no share (never 0%); an unserved value prints no effort and no share", () => {
        draw({ total: 0 });
        expect(screen.getByTestId("facts")).not.toHaveTextContent("%");
        expect(screen.getByTestId("facts")).toHaveTextContent("25 work units");
    });

    it("an unserved value reads as not reported, not zero", () => {
        draw({ value: undefined });
        const facts = screen.getByTestId("facts");
        expect(facts).not.toHaveTextContent("work units");
        expect(facts).not.toHaveTextContent("%");
        expect(facts).toHaveTextContent("Unknown");
    });

    it("a subcategory adds its own fact", () => {
        draw({ subcategoryLabel: "Build" });
        expect(screen.getByTestId("facts")).toHaveTextContent("SubcategoryBuild");
    });
});
