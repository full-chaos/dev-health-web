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

    it("pre-fills form when initialData provided", () => {
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
        expect(screen.getByLabelText("Repository Patterns")).toHaveValue("org/repo-a, org/repo-b");
        expect(screen.getByLabelText("Project Keys")).toHaveValue("PROJ, ENG");
    });

    it("team_id is disabled in edit mode", () => {
        render(<TeamForm onSubmit={mockOnSubmit} isEditing />);

        expect(screen.getByLabelText("Team ID")).toBeDisabled();
    });

    it("submits form with parsed comma-separated values", async () => {
        const user = userEvent.setup();
        render(<TeamForm onSubmit={mockOnSubmit} />);

        await user.type(screen.getByLabelText("Team ID"), "eng");
        await user.type(screen.getByLabelText("Display Name"), "Engineering");
        await user.type(screen.getByLabelText("Repository Patterns"), "org/repo-a, org/repo-b");
        await user.type(screen.getByLabelText("Project Keys"), "PROJ, ENG");

        await user.click(screen.getByRole("button", { name: "Create Team" }));

        expect(mockOnSubmit).toHaveBeenCalledWith({
            team_id: "eng",
            name: "Engineering",
            description: "",
            repo_patterns: ["org/repo-a", "org/repo-b"],
            project_keys: ["PROJ", "ENG"],
        });
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
});
