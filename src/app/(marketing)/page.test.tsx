import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import MarketingPage from "./page";

describe("marketing page mock browser title (CHAOS-7740)", () => {
    it("names the product, not the old Cockpit page", () => {
        render(<MarketingPage />);
        // The title bar of the dashboard preview: three dots, then the page title.
        const title = screen.getByText("Full Chaos Dev Health");
        expect(title).toHaveClass("ml-3");
        expect(screen.queryByText(/Ops Cockpit/)).toBeNull();
    });

    it("step 03 says Home frames everything through your role, not the cockpit", () => {
        render(<MarketingPage />);
        expect(
            screen.getByText(
                /Home frames everything through your role — IC, EM, PM, or Leadership\./,
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/The cockpit frames/)).toBeNull();
    });

    it("the perspectives block says Home adapts to your role, not the cockpit", () => {
        render(<MarketingPage />);
        expect(
            screen.getByText(/^Home adapts to your role — surfacing the metrics and investigation/),
        ).toBeInTheDocument();
        expect(screen.queryByText(/The cockpit adapts/)).toBeNull();
    });
});
