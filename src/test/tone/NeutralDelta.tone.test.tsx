/** CHAOS-9077: the person page change is neutral by design: a rise and a fall carry no good / bad tone. */
import { afterEach, describe, expect, it } from "vitest";

import { NeutralDelta } from "@/components/people/NeutralDelta";
import { cleanup, render, screen } from "@/test/utils";

afterEach(cleanup);

describe("NeutralDelta tone", () => {
    it.each([
        ["rise", 12, "↑"],
        ["fall", -12, "↓"],
    ])("a %s is muted, never positive or negative", (_name, value, arrow) => {
        render(<NeutralDelta value={value} />);
        const el = screen.getByTestId("neutral-delta");
        expect(el).toHaveTextContent(arrow);
        expect(el.className).toContain("text-(--ink-muted)");
        expect(el.className).not.toContain("text-(--positive)");
        expect(el.className).not.toContain("text-(--accent-negative)");
        expect(screen.queryByTestId("metric-delta")).toBeNull();
    });
});
