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
    it("renders one row per provider as a table, not a card grid", () => {
        render(
            <ProviderTable
                providers={[
                    makeRow({ id: "github", name: "GitHub" }),
                    makeRow({ id: "gitlab", name: "GitLab" }),
                ]}
            />,
        );

        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 providers
        expect(screen.getByText("GitHub")).toBeInTheDocument();
        expect(screen.getByText("GitLab")).toBeInTheDocument();
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
        expect(screen.getByText("Connected")).toBeInTheDocument();
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

        const link = screen.getByRole("link", { name: "Manage" });
        expect(link).toHaveAttribute("href", "/org/admin/integrations/linear");
    });
});
