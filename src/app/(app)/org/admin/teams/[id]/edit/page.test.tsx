/**
 * EditTeamPage — asserts the "Linked identities" preview count is never
 * fabricated. When listIdentities() fails/returns no data, the page must
 * pass linkedIdentityCount=undefined (so the preview row is omitted); it
 * must only pass a real number when listIdentities() genuinely succeeded.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import type { IdentityMapping, TeamMapping } from "@/lib/admin/types";
import EditTeamPage from "./page";

const mockGetTeam = vi.fn();
const mockListIdentities = vi.fn();

vi.mock("@/lib/admin/server", () => ({
    getTeam: (...args: unknown[]) => mockGetTeam(...args),
    listIdentities: (...args: unknown[]) => mockListIdentities(...args),
}));

vi.mock("./EditTeamFormWrapper", () => ({
    EditTeamFormWrapper: ({ linkedIdentityCount }: { linkedIdentityCount?: number }) => (
        <div data-testid="linked-identity-count">
            {linkedIdentityCount === undefined ? "undefined" : linkedIdentityCount}
        </div>
    ),
}));

function makeTeam(overrides: Partial<TeamMapping> = {}): TeamMapping {
    return {
        id: "team-row-1",
        team_id: "eng",
        name: "Engineering",
        description: null,
        repo_patterns: [],
        project_keys: [],
        extra_data: {},
        managed_fields: [],
        sync_policy: 0,
        flagged_changes: null,
        last_drift_sync_at: null,
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

function makeIdentity(overrides: Partial<IdentityMapping> = {}): IdentityMapping {
    return {
        id: "identity-1",
        canonical_id: "alice",
        display_name: null,
        email: null,
        provider_identities: {},
        team_ids: [],
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

describe("EditTeamPage — linked identity count", () => {
    beforeEach(() => {
        mockGetTeam.mockReset();
        mockListIdentities.mockReset();
    });

    it("omits the preview row (linkedIdentityCount=undefined) when listIdentities fails", async () => {
        mockGetTeam.mockResolvedValue({ data: makeTeam(), error: undefined });
        mockListIdentities.mockResolvedValue({ data: undefined, error: "backend unavailable" });

        const ui = await EditTeamPage({ params: Promise.resolve({ id: "eng" }) });
        render(ui);

        expect(screen.getByTestId("linked-identity-count")).toHaveTextContent("undefined");
    });

    it("passes a real count when listIdentities genuinely succeeds", async () => {
        mockGetTeam.mockResolvedValue({ data: makeTeam(), error: undefined });
        mockListIdentities.mockResolvedValue({
            data: [
                makeIdentity({ canonical_id: "alice", team_ids: ["eng"] }),
                makeIdentity({ canonical_id: "bob", team_ids: ["design"] }),
                makeIdentity({ canonical_id: "carol", team_ids: ["eng", "design"] }),
            ],
            error: undefined,
        });

        const ui = await EditTeamPage({ params: Promise.resolve({ id: "eng" }) });
        render(ui);

        expect(screen.getByTestId("linked-identity-count")).toHaveTextContent("2");
    });
});
