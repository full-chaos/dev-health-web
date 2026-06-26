import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { GitHubAppConnect } from "@/components/admin/integrations/GitHubAppConnect";

describe("GitHubAppConnect", () => {
    it("renders the one-click install CTA linking to the initiation route", () => {
        render(<GitHubAppConnect />);

        const cta = screen.getByRole("link", { name: "Connect GitHub App" });
        expect(cta).toHaveAttribute("href", "/org/admin/integrations/github-app/install");
        expect(screen.getByText(/one-click install/i)).toBeInTheDocument();
    });

    it("forwards returnTo to the initiation route as an encoded return_to param", () => {
        render(<GitHubAppConnect returnTo="/auth/onboard/integration" />);

        const cta = screen.getByRole("link", { name: "Connect GitHub App" });
        expect(cta).toHaveAttribute(
            "href",
            "/org/admin/integrations/github-app/install?return_to=%2Fauth%2Fonboard%2Fintegration",
        );
    });

    it("invokes onInstallClick when the CTA is activated", () => {
        const onInstallClick = vi.fn();
        render(<GitHubAppConnect onInstallClick={onInstallClick} />);

        fireEvent.click(screen.getByRole("link", { name: "Connect GitHub App" }));
        expect(onInstallClick).toHaveBeenCalledTimes(1);
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
