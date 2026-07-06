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
        expect(screen.getByRole("group", { name: "Teams" })).toBeInTheDocument();
        expect(screen.getByText("Provider Identities")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create Identity" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Cancel" })).toBeInTheDocument();
    });

    it("renders one checkbox per team and supports selecting multiple teams", async () => {
        const user = userEvent.setup();
        render(<IdentityForm teams={mockTeams} onSubmit={mockOnSubmit} />);

        const engineering = screen.getByRole("checkbox", { name: "Engineering" });
        const design = screen.getByRole("checkbox", { name: "Design" });
        expect(engineering).not.toBeChecked();
        expect(design).not.toBeChecked();

        await user.click(engineering);
        await user.click(design);

        expect(engineering).toBeChecked();
        expect(design).toBeChecked();
    });

    it("shows a hint when no teams are available yet", () => {
        render(<IdentityForm teams={[]} onSubmit={mockOnSubmit} />);

        expect(screen.getByText("No teams available yet.")).toBeInTheDocument();
    });

    it('adds provider identity row when clicking "+ Add Identity"', async () => {
        const user = userEvent.setup();
        render(<IdentityForm teams={mockTeams} onSubmit={mockOnSubmit} />);

        await user.click(screen.getByRole("button", { name: "+ Add Identity" }));

        expect(screen.getByPlaceholderText("Username / ID")).toBeInTheDocument();
        expect(screen.getAllByRole("combobox")).toHaveLength(1);
    });

    it("removes provider identity row via its clearly labeled remove action", async () => {
        const user = userEvent.setup();
        render(<IdentityForm teams={mockTeams} onSubmit={mockOnSubmit} />);

        await user.click(screen.getByRole("button", { name: "+ Add Identity" }));
        expect(screen.getByPlaceholderText("Username / ID")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Remove github identity" }));

        expect(screen.queryByPlaceholderText("Username / ID")).not.toBeInTheDocument();
    });

    it("submits form with provider identities and selected teams", async () => {
        const user = userEvent.setup();
        render(<IdentityForm teams={mockTeams} onSubmit={mockOnSubmit} />);

        await user.type(screen.getByLabelText("Canonical ID"), "alice-smith");
        await user.type(screen.getByLabelText("Display Name"), "Alice Smith");
        await user.click(screen.getByRole("checkbox", { name: "Engineering" }));
        await user.click(screen.getByRole("button", { name: "+ Add Identity" }));
        await user.type(screen.getByPlaceholderText("Username / ID"), "octocat");

        await user.click(screen.getByRole("button", { name: "Create Identity" }));

        expect(mockOnSubmit).toHaveBeenCalledWith({
            canonical_id: "alice-smith",
            display_name: "Alice Smith",
            email: "",
            team_ids: ["eng"],
            provider_identities: { github: ["octocat"] },
        });
    });

    it("blocks submit and shows an error when a provider identity has an empty username", async () => {
        const user = userEvent.setup();
        render(<IdentityForm teams={mockTeams} onSubmit={mockOnSubmit} />);

        await user.type(screen.getByLabelText("Canonical ID"), "alice-smith");
        await user.click(screen.getByRole("button", { name: "+ Add Identity" }));

        await user.click(screen.getByRole("button", { name: "Create Identity" }));

        expect(screen.getByRole("alert")).toHaveTextContent(/username/iu);
        expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("blocks submit and shows an error for a duplicate provider identity", async () => {
        const user = userEvent.setup();
        render(<IdentityForm teams={mockTeams} onSubmit={mockOnSubmit} />);

        await user.type(screen.getByLabelText("Canonical ID"), "alice-smith");
        await user.click(screen.getByRole("button", { name: "+ Add Identity" }));
        await user.click(screen.getByRole("button", { name: "+ Add Identity" }));
        const usernameInputs = screen.getAllByPlaceholderText("Username / ID");
        await user.type(usernameInputs[0], "octocat");
        await user.type(usernameInputs[1], "octocat");

        await user.click(screen.getByRole("button", { name: "Create Identity" }));

        expect(screen.getByRole("alert")).toHaveTextContent(/duplicate/iu);
        expect(mockOnSubmit).not.toHaveBeenCalled();
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
