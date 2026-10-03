import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, within } from "@/test/utils";

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

    it("is a section card with the count and the ownership sentence; 'n of N teams' while searching", async () => {
        const user = userEvent.setup();
        render(<TeamTable teams={teams} />);

        expect(screen.getByRole("heading", { level: 2, name: "Teams" })).toBeInTheDocument();
        expect(
            screen.getByText(
                "2 teams · team ownership comes from synced project and repository ownership",
            ),
        ).toBeInTheDocument();

        await user.type(screen.getByPlaceholderText("Search teams"), "dev-health");

        expect(screen.getByText(/^1 of 2 teams · /u)).toBeInTheDocument();
    });

    it("shows patterns and keys as mono chips, and a dash for none", () => {
        render(
            <TeamTable
                teams={[
                    ...teams,
                    {
                        team_id: "core",
                        name: "Core",
                        description: null,
                        repo_patterns: [],
                        project_keys: [],
                    },
                ]}
            />,
        );

        expect(screen.getByText("full-chaos/dev-health").className).toContain("font-mono");
        expect(screen.getByText("CHAOS").className).toContain("font-mono");
        const coreRow = screen.getByRole("link", { name: "Core" }).closest("tr")!;
        expect(within(coreRow).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    });
});
