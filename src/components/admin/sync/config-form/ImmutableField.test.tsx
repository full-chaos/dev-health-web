import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImmutableField } from "./ImmutableField";

describe("ImmutableField", () => {
    it("renders a named inline SVG lock instead of an emoji", () => {
        render(<ImmutableField label="Provider" value="PagerDuty" note="Cannot be changed." />);

        const locked = screen.getByText("Locked");
        expect(locked).toBeVisible();
        expect(screen.getByTestId("immutable-field-lock-icon").tagName).toBe("svg");
        expect(locked.parentElement).not.toHaveTextContent("🔒");
    });
});
