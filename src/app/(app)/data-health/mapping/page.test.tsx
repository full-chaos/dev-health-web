import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import MappingHealthPage from "./page";

// CHAOS-8100: `coveragePct` is served as a percent (0-100; ops coverageStat: covered / total * 100).
// The page showed it multiplied by 100 again, so "1 of 3 repos" read 100%.

vi.mock("next/navigation", () => ({
    usePathname: () => "/data-health/mapping",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn(async () => ({ user: { org_id: "org-1" } })),
}));

const graphqlFetch = vi.fn();
vi.mock("@/lib/graphql/urqlClient", () => ({
    graphqlFetch: (...args: unknown[]) => graphqlFetch(...args),
}));

beforeEach(() => graphqlFetch.mockReset());

describe("Mapping coverage page (CHAOS-8100)", () => {
    it("shows the served percent as served: 1 of 3 repos reads 33%, not 100%", async () => {
        graphqlFetch.mockResolvedValue({
            dataHealth: {
                mappingCoverage: {
                    deployments: { totalRepos: 2, coveredRepos: 2, coveragePct: 100 },
                    workItems: { totalRepos: 3, coveredRepos: 1, coveragePct: 33.333333 },
                },
            },
        });
        render(await MappingHealthPage());

        expect(screen.getByText("1 of 3 Repos").parentElement).toHaveTextContent("33%");
        expect(screen.getByText("2 of 2 Repos").parentElement).toHaveTextContent("100%");
    });

    it("says one plain sentence with Retry when the request failed", async () => {
        // Other callers in the shell tree call graphqlFetch with no document: only the page request fails.
        graphqlFetch.mockImplementation(async (doc?: string) => {
            if (!doc) return {};
            throw new Error("GraphQL 502 upstream");
        });
        const { container } = render(await MappingHealthPage());

        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");
    });
});
