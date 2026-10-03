import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { IdentityGapsTable } from "./IdentityGapsTable";

// CHAOS-8100 (A16, AD-4): loading and error use the shared DataState, Events carries a caption, and
// each row has a "Map identity" action.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const useQuery = vi.fn();
vi.mock("urql", () => ({
    gql: (doc: string) => doc,
    useQuery: (...args: unknown[]) => useQuery(...args),
}));

const identity = {
    provider: "github",
    email: "someone@example.test",
    displayName: "Someone",
    observedCount: 12,
};

function serve(result: Record<string, unknown>) {
    useQuery.mockReturnValue([result]);
}

beforeEach(() => useQuery.mockReset());

describe("IdentityGapsTable", () => {
    it("shows the shared loading state", () => {
        serve({ fetching: true });
        render(<IdentityGapsTable />);

        expect(screen.getByTestId("data-state-loading")).toBeInTheDocument();
    });

    it("shows one plain sentence with Retry on an error, not the raw message", () => {
        serve({ fetching: false, error: new Error("GraphQL 502 upstream") });
        const { container } = render(<IdentityGapsTable />);

        expect(screen.getByTestId("data-state-error")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");
        expect(container.textContent).not.toMatch(/^Error:/u);
    });

    it("has the Events caption and a Map identity link on each row", () => {
        serve({
            fetching: false,
            data: {
                dataHealth: {
                    identityMapping: {
                        unmappedCount: 1,
                        unmappedIdentities: [identity],
                        suggestedAliases: [],
                    },
                },
            },
        });
        render(<IdentityGapsTable />);

        expect(
            screen.getByText(
                /The count shows which mapping matters most; it is not a measure of a person\./u,
            ),
        ).toBeInTheDocument();
        const link = screen.getByRole("link", { name: "Map identity" });
        expect(link).toHaveAttribute("href", "/org/admin/identities/new");
        // No e-mail address or name in the URL.
        expect(link.getAttribute("href")).not.toContain("example.test");
        expect(link.lastElementChild?.tagName.toLowerCase()).toBe("svg");
    });
});
