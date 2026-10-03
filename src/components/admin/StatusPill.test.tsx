import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { CircleCheck } from "lucide-react";

import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
    it("draws the icon before the word, with the status wash and no border", () => {
        render(
            <StatusPill tone="positive" icon={CircleCheck}>
                Active
            </StatusPill>,
        );

        const pill = screen.getByText("Active");
        expect(pill.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        expect(pill.className).toContain("bg-(--positive-wash)");
        expect(pill.className).not.toMatch(/(^|\s)border/u);
    });

    it("outline is a neutral hairline pill with no wash", () => {
        render(<StatusPill tone="outline">sso</StatusPill>);

        const pill = screen.getByText("sso");
        expect(pill.className).toContain("border-(--card-stroke)");
        expect(pill.className).not.toContain("wash");
    });
});
