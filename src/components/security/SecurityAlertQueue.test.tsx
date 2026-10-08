/** SecurityAlertQueue component tests — CHAOS-1240. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { within } from "@testing-library/react";
import { render, screen, userEvent, cleanup } from "@/test/utils";

const { mockUseSecurityAlerts } = vi.hoisted(() => ({
    mockUseSecurityAlerts: vi.fn(),
}));

vi.mock("@/lib/graphql/hooks/useSecurity", () => ({
    useSecurityAlerts: mockUseSecurityAlerts,
}));

vi.mock("./SecurityAlertRow", () => ({
    SecurityAlertRow: ({ alert }: { alert: { alertId: string; title?: string } }) => (
        <tr data-testid="alert-row">
            <td>{alert.title ?? alert.alertId}</td>
        </tr>
    ),
}));

import { SecurityAlertQueue } from "./SecurityAlertQueue";
import type { SecurityFilter } from "@/lib/filters/security";

const filter: SecurityFilter = { openOnly: true };

function defaultResult() {
    return {
        data: undefined,
        fetching: false,
        error: undefined,
        fetchMore: vi.fn(),
        allEdges: [] as Array<{
            cursor: string;
            node: { alertId: string; title: string };
        }>,
    };
}

describe("SecurityAlertQueue", () => {
    beforeEach(() => {
        mockUseSecurityAlerts.mockReset();
    });

    afterEach(() => cleanup());

    it("renders an error card when the query errors", () => {
        mockUseSecurityAlerts.mockReturnValue({
            ...defaultResult(),
            error: new Error("server on fire"),
        });

        render(<SecurityAlertQueue filter={filter} />);

        expect(screen.getByText(/Failed to load security alerts/i)).toBeInTheDocument();
        expect(screen.queryByText(/server on fire/i)).toBeNull();
        expect(screen.getByText("Could not be read")).toBeInTheDocument();
        expect(screen.getByTestId("data-state-error")).toHaveAttribute("data-variant", "error");
    });

    it("renders skeleton rows while fetching the first page", () => {
        mockUseSecurityAlerts.mockReturnValue({
            ...defaultResult(),
            fetching: true,
        });

        const { container } = render(<SecurityAlertQueue filter={filter} />);

        const skeletons = container.querySelectorAll(".animate-pulse");
        expect(skeletons.length).toBe(8);
        expect(screen.queryByTestId("alert-row")).not.toBeInTheDocument();
    });

    it("renders an empty state when there are no alerts and no filters", () => {
        mockUseSecurityAlerts.mockReturnValue({
            ...defaultResult(),
            data: { securityAlerts: { pageInfo: null, totalCount: 0, edges: [] } },
        });

        render(<SecurityAlertQueue filter={filter} />);

        expect(screen.getByText(/No alerts match these filters/i)).toBeInTheDocument();
    });

    it("renders rows for each edge and shows the total count", () => {
        mockUseSecurityAlerts.mockReturnValue({
            ...defaultResult(),
            data: {
                securityAlerts: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    totalCount: 2,
                },
            },
            allEdges: [
                { cursor: "c1", node: { alertId: "a1", title: "Alert One" } },
                { cursor: "c2", node: { alertId: "a2", title: "Alert Two" } },
            ],
        });

        render(<SecurityAlertQueue filter={filter} />);

        expect(screen.getAllByTestId("alert-row")).toHaveLength(2);
        expect(screen.getByText("Alert One")).toBeInTheDocument();
        expect(screen.getByText("Alert Two")).toBeInTheDocument();
        expect(screen.getByText(/2 total/)).toBeInTheDocument();
    });

    it("draws the queue as a table with column headers", () => {
        mockUseSecurityAlerts.mockReturnValue({
            ...defaultResult(),
            data: {
                securityAlerts: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    totalCount: 1,
                },
            },
            allEdges: [{ cursor: "c1", node: { alertId: "a1", title: "Alert One" } }],
        });

        render(<SecurityAlertQueue filter={filter} />);

        const table = screen.getByTestId("alert-queue-table");
        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((cell) => cell.textContent),
        ).toEqual(["Severity", "Source", "Alert", "Package / CVE", "Repository", "State", "Age"]);
    });

    it("shows the repository name in the locked pill when the rows carry it", () => {
        mockUseSecurityAlerts.mockReturnValue({
            ...defaultResult(),
            data: {
                securityAlerts: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    totalCount: 1,
                },
            },
            allEdges: [
                {
                    cursor: "c1",
                    node: { alertId: "a1", title: "A", repoId: "repo-1", repoName: "acme/billing" },
                },
            ],
        });

        render(<SecurityAlertQueue filter={filter} lockedRepoId="repo-1" />);

        expect(screen.getByTestId("locked-repo-pill")).toHaveTextContent("acme/billing");
    });

    it("renders the locked-repo pill when lockedRepoId is provided", () => {
        mockUseSecurityAlerts.mockReturnValue({
            ...defaultResult(),
            data: {
                securityAlerts: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    totalCount: 0,
                },
            },
        });

        render(
            <SecurityAlertQueue
                filter={filter}
                lockedRepoId="3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c"
            />,
        );

        const pill = screen.getByTestId("locked-repo-pill");
        expect(pill.textContent).toBe("Repository");
        expect(pill).toHaveAttribute(
            "title",
            "Repository id: 3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c",
        );
    });

    it("renders a Load more button and calls fetchMore with the end cursor", async () => {
        const fetchMore = vi.fn();
        mockUseSecurityAlerts.mockReturnValue({
            ...defaultResult(),
            data: {
                securityAlerts: {
                    pageInfo: { hasNextPage: true, endCursor: "cursor-x" },
                    totalCount: 50,
                },
            },
            allEdges: [{ cursor: "c1", node: { alertId: "a1", title: "A" } }],
            fetchMore,
        });

        render(<SecurityAlertQueue filter={filter} />);

        const btn = screen.getByRole("button", { name: /load more/i });
        await userEvent.click(btn);

        expect(fetchMore).toHaveBeenCalledWith("cursor-x");
    });
});
