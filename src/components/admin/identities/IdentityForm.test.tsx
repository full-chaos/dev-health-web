import type { ReactNode } from "react";
import { render, screen, userEvent } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IdentityForm } from "./IdentityForm";
import type { Identity } from "./IdentityTable";
import type { Team } from "../teams/TeamTable";

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

const mockOnSubmit = vi.fn();
const mockTeams: Team[] = [
    { team_id: "eng", name: "Engineering", description: null, repo_patterns: [], project_keys: [] },
    { team_id: "design", name: "Design", description: null, repo_patterns: [], project_keys: [] },
];

describe("IdentityForm", () => {
    beforeEach(() => {
        mockOnSubmit.mockClear();
    });

    it("renders all form fields", () => {
        render(<IdentityForm teams={mockTeams} onSubmit={mockOnSubmit} />);

        expect(screen.getByLabelText("Canonical ID")).toBeInTheDocument();
        expect(screen.getByLabelText("Display Name")).toBeInTheDocument();
        expect(screen.getByLabelText("Email")).toBeInTheDocument();
        expect(screen.getByLabelText("Team")).toBeInTheDocument();
        expect(screen.getByText("Provider Identities")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create Identity" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Cancel" })).toBeInTheDocument();
    });

    it("renders team options in select", () => {
        render(<IdentityForm teams={mockTeams} onSubmit={mockOnSubmit} />);

        expect(screen.getByRole("option", { name: "Engineering" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Design" })).toBeInTheDocument();
    });

    it('adds provider identity row when clicking "+ Add Identity"', async () => {
        const user = userEvent.setup();
        render(<IdentityForm teams={mockTeams} onSubmit={mockOnSubmit} />);

        await user.click(screen.getByRole("button", { name: "+ Add Identity" }));

        expect(screen.getByPlaceholderText("Username / ID")).toBeInTheDocument();
        expect(screen.getAllByRole("combobox")).toHaveLength(2);
    });

    it("removes provider identity row", async () => {
        const user = userEvent.setup();
        render(<IdentityForm teams={mockTeams} onSubmit={mockOnSubmit} />);

        await user.click(screen.getByRole("button", { name: "+ Add Identity" }));
        expect(screen.getByPlaceholderText("Username / ID")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Remove identity" }));

        expect(screen.queryByPlaceholderText("Username / ID")).not.toBeInTheDocument();
    });

    it("submits form with provider identities", async () => {
        const user = userEvent.setup();
        render(<IdentityForm teams={mockTeams} onSubmit={mockOnSubmit} />);

        await user.type(screen.getByLabelText("Canonical ID"), "alice-smith");
        await user.type(screen.getByLabelText("Display Name"), "Alice Smith");
        await user.click(screen.getByRole("button", { name: "+ Add Identity" }));
        await user.type(screen.getByPlaceholderText("Username / ID"), "octocat");

        await user.click(screen.getByRole("button", { name: "Create Identity" }));

        expect(mockOnSubmit).toHaveBeenCalledWith({
            canonical_id: "alice-smith",
            display_name: "Alice Smith",
            email: "",
            team_ids: [],
            provider_identities: { github: ["octocat"] },
        });
    });

    it("canonical_id is disabled in edit mode", () => {
        const initialData: Identity = {
            canonical_id: "alice-smith",
            display_name: "Alice Smith",
            email: "alice@example.com",
            team_ids: ["eng"],
            provider_identities: { github: ["octocat"] },
        };

        render(
            <IdentityForm
                teams={mockTeams}
                initialData={initialData}
                onSubmit={mockOnSubmit}
                isEditing
            />,
        );

        expect(screen.getByLabelText("Canonical ID")).toBeDisabled();
    });
});
