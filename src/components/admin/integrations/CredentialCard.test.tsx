import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import { CredentialCard } from "./CredentialCard";
import type { IntegrationCredential } from "@/lib/admin/types";

vi.mock("@/lib/admin/server", () => ({
    testConnection: vi.fn(),
    deleteCredential: vi.fn(),
}));

function makeCredential(overrides: Partial<IntegrationCredential> = {}): IntegrationCredential {
    return {
        id: "cred-1",
        provider: "github",
        name: "Primary GitHub",
        is_active: true,
        config: {},
        last_test_at: "2025-01-01T12:00:00Z",
        last_test_success: true,
        last_test_error: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        ...overrides,
    };
}

describe("CredentialCard", () => {
    afterEach(() => cleanup());

    it("renders the last-tested timestamp with deterministic UTC formatting (no locale drift)", () => {
        render(
            <CredentialCard
                credential={makeCredential()}
                providerName="GitHub"
                isUsedBySyncConfigs={false}
                onEdit={vi.fn()}
            />,
        );

        // Server and client must agree on this string to avoid hydration mismatch.
        expect(screen.getByText("Last tested: Jan 1, 2025, 12:00 PM UTC")).toBeInTheDocument();
    });

    it("shows 'Never tested' when there is no last_test_at", () => {
        render(
            <CredentialCard
                credential={makeCredential({ last_test_at: null })}
                providerName="GitHub"
                isUsedBySyncConfigs={false}
                onEdit={vi.fn()}
            />,
        );

        expect(screen.getByText("Never tested")).toBeInTheDocument();
    });
});
