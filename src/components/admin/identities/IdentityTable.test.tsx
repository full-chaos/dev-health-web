import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, within } from "@/test/utils";

import { IdentityTable, type Identity } from "./IdentityTable";

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: {
        children: ReactNode;
        href: string;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const identities: Identity[] = [
    {
        canonical_id: "alice-smith",
        display_name: "Alice Smith",
        email: "alice@example.com",
        team_ids: ["platform"],
        provider_identities: { github: ["octoalice"] },
    },
    {
        canonical_id: "bo-brown",
        display_name: "Bo Brown",
        email: "bo@example.com",
        team_ids: ["growth"],
        provider_identities: { gitlab: ["bo-lab"] },
    },
];

describe("IdentityTable", () => {
    it("filters rows by provider identity typed into table search", async () => {
        const user = userEvent.setup();
        render(<IdentityTable identities={identities} />);

        await user.type(screen.getByPlaceholderText("Search identities"), "octoalice");

        expect(screen.getByRole("link", { name: "Alice Smith" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Bo Brown" })).not.toBeInTheDocument();
    });

    it("shows a search-specific empty state when no identity matches", async () => {
        const user = userEvent.setup();
        render(<IdentityTable identities={identities} />);

        await user.type(screen.getByPlaceholderText("Search identities"), "not-present");

        expect(screen.getByText("No identities match your search.")).toBeInTheDocument();
        expect(screen.queryByText("No identities found.")).not.toBeInTheDocument();
    });

    it("is a section card with the served count; 'n of N identities' while searching", async () => {
        const user = userEvent.setup();
        render(<IdentityTable identities={identities} />);

        expect(screen.getByRole("heading", { level: 2, name: "Identities" })).toBeInTheDocument();
        expect(screen.getByText("2 identities")).toBeInTheDocument();

        await user.type(screen.getByPlaceholderText("Search identities"), "octoalice");

        expect(screen.getByText("1 of 2 identities")).toBeInTheDocument();
    });

    it("links the display name (else email, else Unresolved), never the canonical id", () => {
        render(
            <IdentityTable
                identities={[
                    ...identities,
                    {
                        canonical_id: "no-name",
                        display_name: null,
                        email: null,
                        team_ids: [],
                        provider_identities: {},
                    },
                ]}
            />,
        );

        expect(screen.queryByText("alice-smith")).toBeNull();
        expect(screen.queryByText("no-name")).toBeNull();
        const row = screen.getAllByRole("link", { name: "Unresolved" })[0].closest("tr")!;
        expect(within(row).getAllByText("—")).toHaveLength(2);
    });

    it("shows a team by its served name through the shared label, linked to the team", () => {
        render(<IdentityTable identities={[identities[0]]} teamNames={{ platform: "Platform" }} />);

        const link = screen.getByRole("link", { name: "Platform" });
        expect(link).toHaveAttribute("href", "/org/admin/teams/platform/edit");
        expect(screen.queryByText("platform")).toBeNull();
        expect(screen.queryByText("Unresolved")).toBeNull();
    });

    it("shows a team id with no served name as a short id + Unresolved (an opaque id), still linked", () => {
        const TEAM = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
        render(
            <IdentityTable identities={[{ ...identities[0], team_ids: [TEAM] }]} teamNames={{}} />,
        );

        const link = screen.getByRole("link", { name: /Unresolved/u });
        expect(link).toHaveAttribute("href", `/org/admin/teams/${TEAM}/edit`);
        expect(link.textContent).not.toContain(TEAM);
    });

    it("searches by team name too", async () => {
        const user = userEvent.setup();
        render(
            <IdentityTable
                identities={identities}
                teamNames={{ platform: "Platform Core", growth: "Growth" }}
            />,
        );

        await user.type(screen.getByPlaceholderText("Search identities"), "Platform Core");

        expect(screen.getByRole("link", { name: "Alice Smith" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Bo Brown" })).not.toBeInTheDocument();
    });
    // CHAOS-9105: the identity id and each team id are encoded in the row links.
    it("encodes the identity id and the team ids in the row links", () => {
        render(
            <IdentityTable
                identities={[
                    {
                        canonical_id: "person+ops@example.com",
                        display_name: "Ops Person",
                        email: "person+ops@example.com",
                        team_ids: ["jira:8012df0c-1a2b-4c3d-9e4f-000000000001", "R&D"],
                        provider_identities: {},
                    },
                ]}
            />,
        );

        const row = screen.getByRole("row", { name: /Ops Person/u });
        const hrefs = within(row)
            .getAllByRole("link")
            .map((link) => link.getAttribute("href"));

        expect(hrefs).toEqual([
            "/org/admin/identities/person%2Bops%40example.com/edit",
            "/org/admin/teams/jira%3A8012df0c-1a2b-4c3d-9e4f-000000000001/edit",
            "/org/admin/teams/R%26D/edit",
            "/org/admin/identities/person%2Bops%40example.com/edit",
        ]);
    });
});
