import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { IntegrationCard, IntegrationProvider } from "./IntegrationCard";

function makeProvider(overrides: Partial<IntegrationProvider> = {}): IntegrationProvider {
    return {
        id: "github",
        name: "GitHub",
        description: "Sync pull requests and issues.",
        icon: <span data-testid="icon" />,
        status: "connected",
        credentialCount: 0,
        ...overrides,
    };
}

describe("IntegrationCard", () => {
    it('renders "Needs verification" and neutral count copy, never "1 connected"', () => {
        render(
            <IntegrationCard provider={makeProvider({ status: "untested", credentialCount: 1 })} />,
        );

        expect(screen.getByText("Needs verification")).toBeInTheDocument();
        expect(screen.getByText("1 credential")).toBeInTheDocument();
        expect(screen.queryByText("1 connected")).not.toBeInTheDocument();
        expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    });

    it("pluralizes credential count copy for more than one credential", () => {
        render(
            <IntegrationCard
                provider={makeProvider({ status: "connected", credentialCount: 3 })}
            />,
        );

        expect(screen.getByText("3 credentials")).toBeInTheDocument();
        expect(screen.queryByText("3 connected")).not.toBeInTheDocument();
    });

    it("hides the count badge when there are no credentials", () => {
        render(
            <IntegrationCard
                provider={makeProvider({ status: "not_configured", credentialCount: 0 })}
            />,
        );

        expect(screen.queryByText(/credential/)).not.toBeInTheDocument();
    });
});
