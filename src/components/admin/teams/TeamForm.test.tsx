import type { ReactNode } from "react";
import { render, screen, userEvent } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TeamForm } from "./TeamForm";
import type { Team } from "./TeamTable";

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

describe("TeamForm", () => {
    beforeEach(() => {
        mockOnSubmit.mockClear();
    });

    it("renders all form fields", () => {
        render(<TeamForm onSubmit={mockOnSubmit} />);

        expect(screen.getByLabelText("Team ID")).toBeInTheDocument();
        expect(screen.getByLabelText("Display Name")).toBeInTheDocument();
        expect(screen.getByLabelText("Description")).toBeInTheDocument();
        expect(screen.getByLabelText("Repository Patterns")).toBeInTheDocument();
        expect(screen.getByLabelText("Project Keys")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create Team" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Cancel" })).toBeInTheDocument();
    });

    it("pre-fills form and renders existing patterns/keys as tokens", () => {
        const initialData: Team = {
            team_id: "eng",
            name: "Engineering",
            description: "Core product team",
            repo_patterns: ["org/repo-a", "org/repo-b"],
            project_keys: ["PROJ", "ENG"],
        };

        render(<TeamForm initialData={initialData} onSubmit={mockOnSubmit} />);

        expect(screen.getByLabelText("Team ID")).toHaveValue("eng");
        expect(screen.getByLabelText("Display Name")).toHaveValue("Engineering");
        expect(screen.getByLabelText("Description")).toHaveValue("Core product team");
        expect(screen.getByText("org/repo-a")).toBeInTheDocument();
        expect(screen.getByText("org/repo-b")).toBeInTheDocument();
        expect(screen.getByText("PROJ")).toBeInTheDocument();
        expect(screen.getByText("ENG")).toBeInTheDocument();
    });

    it("team_id is disabled in edit mode", () => {
        render(<TeamForm onSubmit={mockOnSubmit} isEditing />);

        expect(screen.getByLabelText("Team ID")).toBeDisabled();
    });

    it("submits form with tokens entered via the repository patterns and project keys inputs", async () => {
        const user = userEvent.setup();
        render(<TeamForm onSubmit={mockOnSubmit} />);

        await user.type(screen.getByLabelText("Team ID"), "eng");
        await user.type(screen.getByLabelText("Display Name"), "Engineering");
        await user.type(screen.getByLabelText("Repository Patterns"), "org/repo-a,org/repo-b,");
        await user.type(screen.getByLabelText("Project Keys"), "PROJ,ENG,");

        await user.click(screen.getByRole("button", { name: "Create Team" }));

        expect(mockOnSubmit).toHaveBeenCalledWith({
            team_id: "eng",
            name: "Engineering",
            description: "",
            repo_patterns: ["org/repo-a", "org/repo-b"],
            project_keys: ["PROJ", "ENG"],
        });
    });

    it("rejects a duplicate repository pattern with visible feedback and does not resubmit it", async () => {
        const user = userEvent.setup();
        render(<TeamForm onSubmit={mockOnSubmit} />);

        await user.type(screen.getByLabelText("Repository Patterns"), "org/repo-a,");
        await user.type(screen.getByLabelText("Repository Patterns"), "org/repo-a,");

        expect(screen.getByRole("status")).toHaveTextContent("Already added");
        expect(screen.getAllByRole("button", { name: "Remove org/repo-a" })).toHaveLength(1);
    });

    it("shows loading state", () => {
        render(<TeamForm onSubmit={mockOnSubmit} isLoading />);

        expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    });

    it("cancel link points to teams list", () => {
        render(<TeamForm onSubmit={mockOnSubmit} />);

        expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
            "href",
            "/org/admin/teams",
        );
    });

    it("renders a live review-before-saving preview reflecting entered tokens", async () => {
        const user = userEvent.setup();
        render(<TeamForm onSubmit={mockOnSubmit} />);

        expect(screen.getByText("Review before saving")).toBeInTheDocument();
        expect(screen.getAllByText("None added")).toHaveLength(2);

        await user.type(screen.getByLabelText("Project Keys"), "PROJ,");

        const projectKeysRow = screen.getByText("Project keys").closest("div");
        expect(projectKeysRow).toHaveTextContent("PROJ");
        expect(screen.getAllByText("None added")).toHaveLength(1);
    });

    it("shows a linked-identities row in the review preview when the count is provided", () => {
        render(<TeamForm onSubmit={mockOnSubmit} linkedIdentityCount={3} />);

        expect(screen.getByText("Linked identities")).toBeInTheDocument();
        expect(screen.getByText("3 identities currently mapped")).toBeInTheDocument();
    });

    it("gracefully degrades the review preview when no linked-identity data is available", () => {
        render(<TeamForm onSubmit={mockOnSubmit} />);

        expect(screen.queryByText("Linked identities")).not.toBeInTheDocument();
    });
});
