import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { CustomerPushSourceList } from "./CustomerPushSourceList";
import type { CustomerPushSource } from "@/lib/admin/types";

const source: CustomerPushSource = {
    id: "cps-1",
    org_id: "org-1",
    system: "github",
    instance: "acme/api",
    display_name: "Acme API",
    mode: "customer_push",
    enabled: true,
    webhook_mode: "disabled",
    matched_integration_source_id: null,
    warnings: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
};

describe("CustomerPushSourceList", () => {
    it("shows the empty state only when there are truly no sources", () => {
        render(<CustomerPushSourceList provider="github" providerName="GitHub" sources={[]} />);
        expect(screen.getByText("No customer-push sources yet")).toBeInTheDocument();
    });

    it("does not render the empty state when sources exist", () => {
        render(
            <CustomerPushSourceList provider="github" providerName="GitHub" sources={[source]} />,
        );
        expect(screen.queryByText("No customer-push sources yet")).not.toBeInTheDocument();
        expect(screen.getByText("Acme API")).toBeInTheDocument();
        expect(screen.getByText("acme/api")).toBeInTheDocument();
    });

    it("links each source card to its overview page", () => {
        render(
            <CustomerPushSourceList provider="github" providerName="GitHub" sources={[source]} />,
        );
        expect(screen.getByText("Acme API").closest("a")).toHaveAttribute(
            "href",
            "/org/admin/integrations/github/customer-push/cps-1",
        );
    });

    it("flags sources with backend warnings using the informational (not error) status", () => {
        render(
            <CustomerPushSourceList
                provider="github"
                providerName="GitHub"
                sources={[
                    {
                        ...source,
                        warnings: ["Managed sync is also configured for provider 'github'..."],
                    },
                ]}
            />,
        );
        expect(screen.getByText("Connecting...")).toBeInTheDocument();
    });
});
