import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams("f=abc"),
}));
vi.mock("@/components/charts/Chart", () => ({ Chart: () => <div data-testid="chart" /> }));
vi.mock("@/components/charts/chartTheme", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/charts/chartTheme")>();
    return { ...actual, useChartTheme: () => actual.fallbackTheme };
});

import { TopReposChart } from "./TopReposChart";

const repos = [
    { repoId: "id-a", repoName: "acme/api", repoUrl: "", count: 2 },
    { repoId: "id-b", repoName: "acme/web", repoUrl: "", count: 7 },
];

describe("TopReposChart", () => {
    it("has a visible link per repository to its repo page, biggest count first, with the filter", () => {
        render(<TopReposChart repos={repos} />);

        const links = screen.getAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual([
            "acme/web — 7 alerts",
            "acme/api — 2 alerts",
        ]);
        expect(links[0]).toHaveAttribute("href", "/security/repos/id-b?f=abc");
        expect(screen.getByTestId("top-repos-links").className).not.toContain("sr-only");
        expect(links[0].className).toContain("text-(--accent-2)");
    });

    it("keeps the empty text", () => {
        render(<TopReposChart repos={[]} />);

        expect(screen.getByText("No repos with alerts")).toBeInTheDocument();
    });
});
