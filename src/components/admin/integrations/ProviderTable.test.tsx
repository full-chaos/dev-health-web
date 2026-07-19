import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProviderTable, type ProviderRow } from "./ProviderTable";

function makeRow(overrides: Partial<ProviderRow> = {}): ProviderRow {
    return {
        id: "github",
        name: "GitHub",
        description: "Sync pull requests and issues.",
        icon: <span data-testid="icon" />,
        status: "not_configured",
        credentialCount: 0,
        singleCredentialName: null,
        authMethodLabel: null,
        lastTestedAt: null,
        syncConfigCount: 0,
        ...overrides,
    };
}

describe("ProviderTable", () => {
    it("renders mobile cards and the desktop table for every provider", () => {
        render(
            <ProviderTable
                providers={[
                    makeRow({ id: "github", name: "GitHub" }),
                    makeRow({ id: "gitlab", name: "GitLab" }),
                ]}
            />,
        );

        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Providers" })).toHaveAttribute("tabindex", "0");
        expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 providers
        expect(screen.getByTestId("provider-mobile-list")).toHaveClass("lg:hidden");
        expect(screen.getAllByText("GitHub")).toHaveLength(2);
        expect(screen.getAllByText("GitLab")).toHaveLength(2);
    });

    it("shows the single credential's name and auth method when exactly one exists", () => {
        render(
            <ProviderTable
                providers={[
                    makeRow({
                        credentialCount: 1,
                        singleCredentialName: "Production Token",
                        authMethodLabel: "Personal access token",
                        status: "connected",
                        lastTestedAt: "2026-01-01T12:00:00Z",
                        syncConfigCount: 2,
                    }),
                ]}
            />,
        );

        expect(screen.getByText("Production Token")).toBeInTheDocument();
        expect(screen.getByText("Personal access token")).toBeInTheDocument();
        expect(screen.getAllByText("Connected")).toHaveLength(2);
        expect(screen.getByText("2")).toBeInTheDocument();
    });

    it('shows "Not connected" / never-tested placeholders when a provider has no credentials', () => {
        render(<ProviderTable providers={[makeRow({ credentialCount: 0 })]} />);

        expect(screen.getByText("Not connected")).toBeInTheDocument();
        expect(screen.getByText("Never tested")).toBeInTheDocument();
    });

    it("summarizes multiple credentials by count instead of a single name", () => {
        render(
            <ProviderTable
                providers={[
                    makeRow({
                        credentialCount: 3,
                        singleCredentialName: null,
                        authMethodLabel: null,
                    }),
                ]}
            />,
        );

        expect(screen.getByText("3 credentials")).toBeInTheDocument();
        expect(screen.getByText("Mixed")).toBeInTheDocument();
    });

    it("links each row's Manage action to that provider's detail page", () => {
        render(<ProviderTable providers={[makeRow({ id: "linear", name: "Linear" })]} />);

        for (const link of screen.getAllByRole("link", { name: "Manage" })) {
            expect(link).toHaveAttribute("href", "/org/admin/integrations/linear");
        }
    });
});
