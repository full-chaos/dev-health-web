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

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/admin/server", () => ({
    deleteTeam: vi.fn(),
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
    it("offers delete for a manually created team only", () => {
        render(
            <TeamTable
                teams={[
                    { ...teams[0], team_id: "custom:abc", name: "Night Owls" },
                    { ...teams[1], team_id: "gh:acme/growth" },
                ]}
            />,
        );

        expect(screen.getByRole("button", { name: "Delete Night Owls" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Delete Growth" })).not.toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /^Delete / })).toHaveLength(1);
    });

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
    // CHAOS-9105: a raw id in the href made the router prefetch the same edit route without end.
    it.each([
        [
            "jira:8012df0c-1a2b-4c3d-9e4f-000000000001",
            "jira%3A8012df0c-1a2b-4c3d-9e4f-000000000001",
        ],
        ["custom:alpha", "custom%3Aalpha"],
        ["R&D", "R%26D"],
        ["a/b", "a%2Fb"],
        ["50%", "50%25"],
    ])("encodes the team id %j in both edit links of the row", (teamId, encoded) => {
        render(<TeamTable teams={[{ ...teams[0], team_id: teamId, name: "Special" }]} />);

        const row = screen.getByRole("row", { name: /Special/u });
        const hrefs = within(row)
            .getAllByRole("link")
            .map((link) => link.getAttribute("href"));

        expect(hrefs).toEqual([
            `/org/admin/teams/${encoded}/edit`,
            `/org/admin/teams/${encoded}/edit`,
        ]);
    });
});
