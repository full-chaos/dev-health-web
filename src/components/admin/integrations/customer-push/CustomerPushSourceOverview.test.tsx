import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { CustomerPushSourceOverview } from "./CustomerPushSourceOverview";
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

describe("CustomerPushSourceOverview", () => {
    it("renders the 4 link-cards to Credentials/Examples/Validate/Batches (D1)", () => {
        render(<CustomerPushSourceOverview provider="github" source={source} />);
        for (const [title, segment] of [
            ["Credentials", "credentials"],
            ["Runner setup examples", "examples"],
            ["Validate payload", "validate"],
            ["Ingest status", "batches"],
        ]) {
            const link = screen.getByText(title).closest("a");
            expect(link).toHaveAttribute(
                "href",
                `/org/admin/integrations/github/customer-push/cps-1/${segment}`,
            );
        }
    });

    it("renders backend-authored warnings verbatim, only when present", () => {
        const { rerender } = render(
            <CustomerPushSourceOverview provider="github" source={source} />,
        );
        expect(screen.queryByText(/managed sync/i)).not.toBeInTheDocument();

        const warning =
            "Managed sync is also configured for provider 'github' in this organization -- verify this is a different repository/workspace.";
        rerender(
            <CustomerPushSourceOverview
                provider="github"
                source={{ ...source, warnings: [warning] }}
            />,
        );
        expect(screen.getByText(warning)).toBeInTheDocument();
    });
});
