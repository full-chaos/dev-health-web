import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { TeamTable, type Team } from "./TeamTable";

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

const teams: Team[] = [
    {
        team_id: "platform",
        name: "Platform",
        description: "Core product systems",
        repo_patterns: ["full-chaos/dev-health"],
        project_keys: ["CHAOS"],
    },
    {
        team_id: "growth",
        name: "Growth",
        description: "Activation experiments",
        repo_patterns: ["full-chaos/landing"],
        project_keys: ["GROW"],
    },
];

describe("TeamTable", () => {
    it("filters rows by team metadata typed into table search", async () => {
        const user = userEvent.setup();
        render(<TeamTable teams={teams} />);

        await user.type(screen.getByPlaceholderText("Search teams"), "dev-health");

        expect(screen.getByRole("link", { name: "Platform" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Growth" })).not.toBeInTheDocument();
    });

    it("shows a search-specific empty state when no team matches", async () => {
        const user = userEvent.setup();
        render(<TeamTable teams={teams} />);

        await user.type(screen.getByPlaceholderText("Search teams"), "not-present");

        expect(screen.getByText("No teams match your search.")).toBeInTheDocument();
        expect(screen.queryByText("No teams found.")).not.toBeInTheDocument();
    });
});
