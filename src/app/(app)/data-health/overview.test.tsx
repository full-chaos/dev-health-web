import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

import DataHealthOverviewPage from "./page";

// CHAOS-8100 (A14): the Data Confidence overview cards carry a headline value from the served
// `dataHealth` data. A failed request reads "Not reported", never 0.

vi.mock("next/navigation", () => ({
    usePathname: () => "/data-health",
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

type Served = {
    connectors?: Array<{ provider: string; lastFailure?: { message: string } | null }>;
    unmappedCount?: number;
    deployments?: number;
    workItems?: number;
};

function serve({ connectors = [], unmappedCount = 0, deployments = 0, workItems = 0 }: Served) {
    graphqlFetch.mockImplementation(async (doc?: string) => {
        if (!doc) return {};
        if (doc.includes("GetConnectorsDataHealth")) return { dataHealth: { connectors } };
        if (doc.includes("DataHealthIdentity")) {
            return { dataHealth: { identityMapping: { unmappedCount } } };
        }
        return {
            dataHealth: {
                mappingCoverage: {
                    deployments: { coveragePct: deployments },
                    workItems: { coveragePct: workItems },
                },
            },
        };
    });
}

const card = (title: string) => screen.getByRole("heading", { name: title }).closest("a")!;

beforeEach(() => graphqlFetch.mockReset());

describe("Data Confidence overview (CHAOS-8100)", () => {
    it("shows the served headline values and the failure count", async () => {
        serve({
            connectors: [
                { provider: "github", lastFailure: null },
                { provider: "jira", lastFailure: { message: "x" } },
                { provider: "linear", lastFailure: { message: "y" } },
            ],
            unmappedCount: 9,
            deployments: 83.3,
            workItems: 50,
        });
        render(await DataHealthOverviewPage());

        expect(card("Connectors")).toHaveTextContent("3 connectors");
        expect(card("Connectors")).toHaveTextContent("2 with a failure");
        expect(card("Identity Coverage")).toHaveTextContent("9 unmapped");
        expect(
            within(card("Identity Coverage")).getByText("Review", { exact: true }),
        ).toBeInTheDocument();
        expect(card("Mapping Coverage")).toHaveTextContent("83% deployments");
        expect(card("Mapping Coverage")).toHaveTextContent("Work items 50%");
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Data Confidence");
    });

    it("shows no pill when nothing fails or is unmapped, and builds no freshness or Good claim", async () => {
        serve({ connectors: [{ provider: "github" }], unmappedCount: 0, deployments: 100 });
        const { container } = render(await DataHealthOverviewPage());

        expect(container.textContent).not.toContain("with a failure");
        expect(screen.queryByText("Review", { exact: true })).toBeNull();
        expect(container.textContent).not.toMatch(/current|Good/u);
    });

    it("reads 'Not reported' (not 0) for a card whose request failed", async () => {
        graphqlFetch.mockImplementation(async (doc?: string) => {
            if (!doc) return {};
            if (doc.includes("DataHealthIdentity")) throw new Error("backend down");
            return {
                dataHealth: {
                    connectors: [],
                    mappingCoverage: {
                        deployments: { coveragePct: 10 },
                        workItems: { coveragePct: 10 },
                    },
                },
            };
        });
        render(await DataHealthOverviewPage());

        expect(card("Identity Coverage")).toHaveTextContent("Not reported");
        expect(card("Identity Coverage")).not.toHaveTextContent("0 unmapped");
        expect(card("Connectors")).toHaveTextContent("0 connectors");
    });
});
