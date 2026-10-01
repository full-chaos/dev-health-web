import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { STATUS_PILL } from "@/lib/statusPill";

import { SeverityPill } from "./SeverityPill";

describe("SeverityPill", () => {
    it.each([
        ["low", "Low", STATUS_PILL.positive],
        ["moderate", "Moderate", STATUS_PILL.caution],
        ["high", "High", STATUS_PILL.negative],
        ["critical", "Critical", STATUS_PILL.negative],
    ])("shows %s as a labelled pill with its status tone", (severity, label, tone) => {
        render(<SeverityPill severity={severity} />);

        const pill = screen.getByTestId("release-friction-severity");
        expect(pill).toHaveTextContent(label);
        expect(pill).toHaveAttribute("data-severity", severity);
        expect(pill.className).toContain(tone);
        expect(pill.querySelector("svg")).not.toBeNull();
    });

    it.each([[null], [undefined], ["weird"]])(
        "shows %s as Unavailable, a neutral state of its own, never a level",
        (severity) => {
            render(<SeverityPill severity={severity} />);

            const pill = screen.getByTestId("release-friction-severity");
            expect(pill).toHaveTextContent("Unavailable");
            expect(pill).toHaveAttribute("data-severity", "unavailable");
            expect(pill.className).toContain(STATUS_PILL.muted);
            expect(pill.className).not.toContain(STATUS_PILL.positive);
            expect(pill.className).not.toContain(STATUS_PILL.negative);
        },
    );
});
