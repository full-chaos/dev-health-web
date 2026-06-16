import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { GitHubAppConnect } from "@/components/admin/integrations/GitHubAppConnect";

describe("GitHubAppConnect", () => {
    it("renders the one-click install CTA linking to the initiation route", () => {
        render(<GitHubAppConnect />);

        const cta = screen.getByRole("link", { name: "Connect GitHub App" });
        expect(cta).toHaveAttribute("href", "/admin/integrations/github-app/install");
        expect(screen.getByText(/one-click install/i)).toBeInTheDocument();
    });

    it("shows a success banner when the result is connected", () => {
        render(<GitHubAppConnect result="connected" />);

        const banner = screen.getByRole("status");
        expect(banner).toHaveTextContent(/GitHub App connected/i);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows an error banner when the result is error", () => {
        render(<GitHubAppConnect result="error" />);

        const banner = screen.getByRole("alert");
        expect(banner).toHaveTextContent(/couldn.t connect the GitHub App/i);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("renders no banner when there is no result", () => {
        render(<GitHubAppConnect />);

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});
