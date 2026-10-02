import { describe, expect, it } from "vitest";

import { render, screen, within } from "@/test/utils";
import type { HotspotRow } from "@/components/complexity/ComplexityDashboard";
import type { BusFactor } from "@/lib/graphql/types";
import type { QuadrantResponse } from "@/lib/types";

import { HotspotsView, OwnershipView, ReposView, TeamsView } from "./LandscapeTabs";

/**
 * CHAOS-7761 pin: strings, columns, order and sort of the four Landscape table tabs
 * (production). The page pass restyles the cards and tables; none of this may change.
 * All names are invented.
 */
const axes = {
    x: { metric: "x", label: "x", unit: "u" },
    y: { metric: "y", label: "y", unit: "u" },
};
const pt = (id: string, label: string, x: number, y: number) => ({
    entity_id: id,
    entity_label: label,
    x,
    y,
    window_start: "2026-06-01",
    window_end: "2026-09-01",
    evidence_link: "/explore",
});
const cycle: QuadrantResponse = {
    axes,
    annotations: [],
    points: [
        pt("t1", "Team Alpha", 4.2, 10),
        pt("t2", "Team Beta", 6.5, 30),
        pt("t3", "Team Gamma", 2, 20),
    ],
};
const churn: QuadrantResponse = {
    axes,
    annotations: [],
    points: [pt("t1", "Team Alpha", 1200, 10), pt("t2", "Team Beta", 300, 30)],
};
const hot = (repoId: string, repoName: string, filePath: string, risk: number, churnLoc: number) =>
    ({
        repoId,
        repoName,
        filePath,
        riskScore: risk,
        churnLoc30d: churnLoc,
    }) as unknown as HotspotRow;
const hotspots: HotspotRow[] = [
    hot("r1", "repo-one", "src/a/low.ts", 0.2, 10),
    hot("r1", "repo-one", "src/a/high.ts", 0.9, 500),
    hot("r2", "repo-two", "src/b/mid.ts", 0.5, 40),
];

const headers = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent);
const firstCells = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("tbody tr")).map(
        (tr) => tr.querySelector("td")?.textContent,
    );

describe("Teams tab (pin)", () => {
    it("keeps the title, description, columns and the throughput-descending order", () => {
        const { container } = render(<TeamsView cycleData={cycle} churnData={churn} />);
        expect(screen.getByRole("heading", { name: "Teams" })).toBeInTheDocument();
        expect(
            screen.getByText(
                "Delivery pace and pressure per team — throughput against cycle time and change volume.",
            ),
        ).toBeInTheDocument();
        expect(headers(container)).toEqual([
            "Team",
            "Throughput (items)",
            "Cycle time (days)",
            "Churn (loc)",
        ]);
        expect(firstCells(container)).toEqual(["Team Beta", "Team Gamma", "Team Alpha"]);
        // a team with no churn point shows an em dash
        const gamma = within(screen.getByText("Team Gamma").closest("tr") as HTMLElement);
        expect(gamma.getAllByRole("cell").at(-1)).toHaveTextContent("—");
    });
    it("keeps the empty state", () => {
        render(<TeamsView cycleData={null} churnData={null} />);
        expect(screen.getByText("No team data")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Team operating-mode data is not available for this scope and window.",
            ),
        ).toBeInTheDocument();
    });
});

describe("Repos tab (pin)", () => {
    it("keeps the columns and the churn-descending order", () => {
        const { container } = render(<ReposView hotspots={hotspots} />);
        expect(screen.getByRole("heading", { name: "Repos" })).toBeInTheDocument();
        expect(
            screen.getByText(
                "Repository activity and risk — change volume and average hotspot risk across tracked files.",
            ),
        ).toBeInTheDocument();
        expect(headers(container)).toEqual(["Repo", "Hotspot files", "Churn LOC 30d", "Avg risk"]);
        expect(firstCells(container)).toEqual(["repo-one", "repo-two"]);
    });
    it("keeps the empty state", () => {
        render(<ReposView hotspots={[]} />);
        expect(screen.getByText("No repository data")).toBeInTheDocument();
        expect(
            screen.getByText("Repository hotspot data is not available for this scope and window."),
        ).toBeInTheDocument();
    });
});

describe("Ownership tab (pin; decision L3 pending: the maintainer column stays as production)", () => {
    const bus = {
        repos: [
            {
                repoId: "r1",
                repoName: "repo-one",
                value: 3,
                topMaintainers: [{ author: "Maintainer One", sharePercent: 61.4 }],
            },
            { repoId: "r2", repoName: "repo-two", value: 1, topMaintainers: [] },
        ],
    } as unknown as BusFactor;
    it("keeps the four columns, the ascending bus-factor order and the maintainer name", () => {
        const { container } = render(<OwnershipView busFactor={bus} />);
        expect(screen.getByRole("heading", { name: "Ownership risk" })).toBeInTheDocument();
        expect(
            screen.getByText(
                "Bus factor per repository — how many maintainers carry each repo. Lower means more single-owner risk.",
            ),
        ).toBeInTheDocument();
        expect(headers(container)).toEqual(["Repo", "Bus factor", "Top maintainer", "Share"]);
        expect(firstCells(container)).toEqual(["repo-two", "repo-one"]);
        expect(screen.getByText("Maintainer One")).toBeInTheDocument();
        expect(screen.getByText("61%")).toBeInTheDocument();
    });
    it("keeps the empty state", () => {
        render(<OwnershipView busFactor={null} />);
        expect(screen.getByText("No ownership data")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Bus-factor data needs commit-author history for this scope and window.",
            ),
        ).toBeInTheDocument();
    });
});

describe("Hotspots tab (pin)", () => {
    it("keeps the columns, the risk-descending order, the file name and its path tooltip", () => {
        const { container } = render(<HotspotsView hotspots={hotspots} />);
        expect(screen.getByRole("heading", { name: "Hotspots" })).toBeInTheDocument();
        expect(
            screen.getByText(
                "Files carrying the most risk — churn × complexity × ownership concentration.",
            ),
        ).toBeInTheDocument();
        expect(headers(container)).toEqual(["File", "Repo", "Risk score", "Churn LOC 30d"]);
        expect(firstCells(container)).toEqual(["high.ts", "mid.ts", "low.ts"]);
        expect(screen.getByText("high.ts")).toHaveAttribute("title", "src/a/high.ts");
    });
    it("shows at most 25 rows", () => {
        const many = Array.from({ length: 40 }, (_, i) =>
            hot("r", "repo", `f/${i}.ts`, i / 100, i),
        );
        const { container } = render(<HotspotsView hotspots={many} />);
        expect(container.querySelectorAll("tbody tr")).toHaveLength(25);
    });
    it("keeps the empty state", () => {
        render(<HotspotsView hotspots={[]} />);
        expect(screen.getByText("No hotspot files")).toBeInTheDocument();
        expect(
            screen.getByText("No files crossed the hotspot risk threshold in this window."),
        ).toBeInTheDocument();
    });
});
