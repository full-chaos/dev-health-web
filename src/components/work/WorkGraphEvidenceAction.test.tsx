import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";
import { defaultMetricFilter } from "@/lib/filters/defaults";

const hooks = vi.hoisted(() => ({
    flow: vi.fn(),
    artifacts: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/diagnose/work-graph",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/graphql/hooks", () => ({
    useWorkGraphFlow: (...args: unknown[]) => hooks.flow(...args),
    useWorkGraphArtifacts: (...args: unknown[]) => hooks.artifacts(...args),
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-1" }));

import { WorkGraphEvidenceAction } from "./WorkGraphEvidenceAction";

const empty = { rows: [], loading: false, error: null, degradedReason: null, refetch: vi.fn() };

beforeEach(() => {
    hooks.flow.mockReturnValue(empty);
    hooks.artifacts.mockReturnValue(empty);
});

const rows = async () => {
    await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
    return within(await screen.findByTestId("page-evidence-facts"))
        .getAllByTestId("evidence-fact")
        .map((row) => [row.querySelector("dt")?.textContent, row.querySelector("dd")?.textContent]);
};

describe("WorkGraphEvidenceAction", () => {
    it("Inflow-Outflow: lists the body rows (zero rows dropped, ranked by volume) with the balance word", async () => {
        hooks.flow.mockReturnValue({
            ...empty,
            rows: [
                { nodeType: "ISSUE", inflow: 10, outflow: 2 },
                { nodeType: "COMMIT", inflow: 0, outflow: 0 },
                { nodeType: "PR", inflow: 1, outflow: 9 },
            ],
        });
        render(
            <WorkGraphEvidenceAction filters={defaultMetricFilter} activeTab="inflow-outflow" />,
        );

        expect(await rows()).toEqual([
            ["Issue", "Inflow 10 · Outflow 2 · More incoming"],
            ["Pull Request", "Inflow 1 · Outflow 9 · More outgoing"],
        ]);
    });

    it("Artifacts: lists the body rows as type, entity and connections; an unresolved entity says so, never its id", async () => {
        hooks.artifacts.mockReturnValue({
            ...empty,
            rows: [
                {
                    nodeType: "PR",
                    nodeId: "PR-1",
                    displayName: "PR-1: Add login",
                    degree: 4,
                    evidence: null,
                },
                {
                    nodeType: "ISSUE",
                    nodeId: "opaque-id-123",
                    displayName: null,
                    degree: 2,
                    evidence: null,
                },
            ],
        });
        render(<WorkGraphEvidenceAction filters={defaultMetricFilter} activeTab="artifacts" />);

        const all = await rows();
        expect(all).toEqual([
            ["Pull Request · PR-1: Add login", "4 connections"],
            ["Issue · Unresolved", "2 connections"],
        ]);
        expect(JSON.stringify(all)).not.toContain("opaque-id-123");
    });

    it("a type the page has no label for reads 'Unlabelled type', never undefined", async () => {
        hooks.flow.mockReturnValue({
            ...empty,
            rows: [
                { nodeType: "ISSUE", inflow: 3, outflow: 0 },
                { nodeType: "NEW_TYPE", inflow: 5, outflow: 0 },
                { nodeType: "OTHER_TYPE", inflow: 1, outflow: 0 },
            ],
        });
        render(
            <WorkGraphEvidenceAction filters={defaultMetricFilter} activeTab="inflow-outflow" />,
        );

        const labels = (await rows()).map(([label]) => label);
        expect(labels).toEqual(["Unlabelled type", "Issue", "Unlabelled type"]);
    });

    it("queries only the active tab's aggregate", () => {
        render(<WorkGraphEvidenceAction filters={defaultMetricFilter} activeTab="artifacts" />);

        expect(hooks.flow).toHaveBeenCalledWith(expect.objectContaining({ pause: true }));
        expect(hooks.artifacts).toHaveBeenCalledWith(expect.objectContaining({ pause: false }));
    });

    it("draws nothing without rows, and nothing on the other tabs", () => {
        const first = render(
            <WorkGraphEvidenceAction filters={defaultMetricFilter} activeTab="artifacts" />,
        );
        expect(screen.queryByRole("button", { name: "View evidence" })).toBeNull();
        first.unmount();
        hooks.flow.mockReturnValue({
            ...empty,
            rows: [{ nodeType: "ISSUE", inflow: 1, outflow: 0 }],
        });
        render(
            <WorkGraphEvidenceAction filters={defaultMetricFilter} activeTab="review-network" />,
        );
        expect(screen.queryByRole("button", { name: "View evidence" })).toBeNull();
    });

    it.each(["overview", "dependencies"])(
        "%s: View evidence lists the served entity-type aggregate",
        async (tab) => {
            hooks.flow.mockReturnValue({
                ...empty,
                rows: [{ nodeType: "ISSUE", inflow: 10, outflow: 2 }],
            });
            render(<WorkGraphEvidenceAction filters={defaultMetricFilter} activeTab={tab} />);

            expect(await rows()).toEqual([["Issue", "Inflow 10 · Outflow 2 · More incoming"]]);
        },
    );
});
