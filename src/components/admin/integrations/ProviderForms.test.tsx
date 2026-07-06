import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GitHubForm } from "./ProviderForms";

describe("GitHubForm", () => {
    it("renders the personal access token field as the primary, non-collapsed field", () => {
        render(<GitHubForm />);

        expect(screen.getByLabelText("Personal access token")).toHaveAttribute("name", "token");
        expect(screen.getByLabelText("Organization / Owner")).toHaveAttribute("name", "org");
    });

    it("tucks manual GitHub App credential fields behind a collapsed advanced disclosure", () => {
        render(<GitHubForm />);

        const details = screen
            .getByText("Advanced: manual GitHub App credential")
            .closest("details");
        expect(details).not.toBeNull();
        expect(details).not.toHaveAttribute("open");

        expect(screen.getByLabelText("App ID")).toHaveAttribute("name", "appId");
        expect(screen.getByLabelText("Installation ID")).toHaveAttribute("name", "installationId");
        expect(screen.getByLabelText("Private key PEM")).toHaveAttribute("name", "privateKey");
        expect(screen.getByLabelText("API base URL")).toHaveAttribute("name", "baseUrl");
    });
});
