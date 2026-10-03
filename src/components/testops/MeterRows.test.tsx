import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import { MeterRows } from "./MeterRows";

afterEach(cleanup);

const fills = () =>
    screen.getAllByTestId("meter-row").map((row) => {
        const fill = within(row).queryByTestId("meter-fill");
        return fill ? (fill as HTMLElement).style.width : null;
    });

describe("MeterRows (local copy of the shared meter rows)", () => {
    it("draws label, track and value per row; the fill is the value against max", () => {
        render(
            <MeterRows
                max={100}
                rows={[
                    { label: "Line coverage", value: 60, display: "60%" },
                    { label: "Branch coverage", value: 54, display: "54%" },
                ]}
            />,
        );
        expect(screen.getAllByTestId("meter-row").map((r) => r.textContent)).toEqual([
            "Line coverage60%",
            "Branch coverage54%",
        ]);
        expect(fills()).toEqual(["60%", "54%"]);
    });

    it("uses the largest served value as max by default, and the unit after the default text", () => {
        render(
            <MeterRows
                unit="%"
                rows={[
                    { label: "a", value: 20 },
                    { label: "b", value: 40 },
                ]}
            />,
        );
        expect(fills()).toEqual(["50%", "100%"]);
        expect(screen.getAllByTestId("meter-row")[0]).toHaveTextContent("20%");
    });

    it("reads a row with no served value as 'Not reported' with an empty track", () => {
        render(<MeterRows max={100} rows={[{ label: "Branch coverage", value: null }]} />);
        const row = screen.getByTestId("meter-row");
        expect(row).toHaveTextContent("Not reported");
        expect(row).toHaveAttribute("data-reported", "false");
        expect(within(row).queryByTestId("meter-fill")).toBeNull();
    });

    it("draws a served 0 as an empty track and '0', not as 'Not reported'", () => {
        render(<MeterRows max={100} rows={[{ label: "Line coverage", value: 0 }]} />);
        const row = screen.getByTestId("meter-row");
        expect(row).toHaveTextContent("0");
        expect(row).not.toHaveTextContent("Not reported");
        expect(row).toHaveAttribute("data-reported", "true");
        expect(within(row).queryByTestId("meter-fill")).toBeNull();
    });

    it("never draws a fill wider than the track", () => {
        render(<MeterRows max={100} rows={[{ label: "x", value: 140 }]} />);
        expect(fills()).toEqual(["100%"]);
    });
});
