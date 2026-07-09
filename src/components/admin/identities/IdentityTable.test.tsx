import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

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

        expect(screen.getByRole("link", { name: "alice-smith" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "bo-brown" })).not.toBeInTheDocument();
    });

    it("shows a search-specific empty state when no identity matches", async () => {
        const user = userEvent.setup();
        render(<IdentityTable identities={identities} />);

        await user.type(screen.getByPlaceholderText("Search identities"), "not-present");

        expect(screen.getByText("No identities match your search.")).toBeInTheDocument();
        expect(screen.queryByText("No identities found.")).not.toBeInTheDocument();
    });
});
