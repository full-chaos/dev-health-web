import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/admin/server", () => ({
    testConnection: vi.fn(),
    createCredential: vi.fn(),
}));

import { ProvidersPage } from "./ProvidersPage";
import type { ProviderRow } from "./ProviderTable";

function makeRow(overrides: Partial<ProviderRow> = {}): ProviderRow {
    return {
        id: "github",
        name: "GitHub",
        description: "",
        icon: <span />,
        status: "not_configured",
        credentialCount: 0,
        singleCredentialName: null,
        authMethodLabel: null,
        lastTestedAt: null,
        syncConfigCount: 0,
        ...overrides,
    };
}

describe("ProvidersPage", () => {
    it("renders the provider table with an Add Provider action, not a card grid", () => {
        render(<ProvidersPage providers={[makeRow()]} credentials={[]} />);

        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Add Provider" })).toBeInTheDocument();
    });

    it("opens the Add Provider wizard, starting on the provider-select step", async () => {
        render(<ProvidersPage providers={[makeRow()]} credentials={[]} />);

        await userEvent.click(screen.getByRole("button", { name: "Add Provider" }));

        expect(
            screen.getByText("Choose the tool you want Dev Health to connect to."),
        ).toBeInTheDocument();
    });
});
