import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GitHubForm } from "./ProviderForms";

describe("GitHubForm", () => {
    it("renders personal access token and GitHub App credential fields", () => {
        render(<GitHubForm />);

        expect(screen.getByLabelText("Token")).toHaveAttribute("name", "token");
        expect(screen.getByLabelText("App ID")).toHaveAttribute("name", "appId");
        expect(screen.getByLabelText("Installation ID")).toHaveAttribute("name", "installationId");
        expect(screen.getByLabelText("Private key PEM")).toHaveAttribute("name", "privateKey");
        expect(screen.getByLabelText("API base URL")).toHaveAttribute("name", "baseUrl");
    });
});
