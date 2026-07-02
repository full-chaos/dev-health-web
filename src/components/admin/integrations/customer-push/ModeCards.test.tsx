import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { ModeCards } from "./ModeCards";

describe("ModeCards", () => {
    it("renders both mode cards for a normal provider", () => {
        render(
            <ModeCards
                provider="github"
                providerName="GitHub"
                showManagedSync
                customerPushSourceCount={0}
            />,
        );
        expect(screen.getByText("Managed sync")).toBeInTheDocument();
        expect(screen.getByText("Customer push")).toBeInTheDocument();
    });

    it("omits the managed-sync card for the custom pseudo-provider (D3)", () => {
        render(
            <ModeCards
                provider="custom"
                providerName="Custom"
                showManagedSync={false}
                customerPushSourceCount={0}
            />,
        );
        expect(screen.queryByText("Managed sync")).not.toBeInTheDocument();
        expect(screen.getByText("Customer push")).toBeInTheDocument();
    });

    it("links the customer-push CTA to /new when there are no sources yet", () => {
        render(
            <ModeCards
                provider="github"
                providerName="GitHub"
                showManagedSync
                customerPushSourceCount={0}
            />,
        );
        expect(screen.getByRole("link", { name: /set up customer push/i })).toHaveAttribute(
            "href",
            "/org/admin/integrations/github/customer-push/new",
        );
    });

    it("scroll-anchors the customer-push CTA to the existing source list when sources exist", () => {
        render(
            <ModeCards
                provider="github"
                providerName="GitHub"
                showManagedSync
                customerPushSourceCount={2}
            />,
        );
        expect(screen.getByRole("link", { name: /set up customer push/i })).toHaveAttribute(
            "href",
            "#customer-push-sources",
        );
    });
});
