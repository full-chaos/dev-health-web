import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { QualityCoverageTabs, activeTabFromPath } from "../QualityCoverageTabs";
import { withFilterParam } from "@/lib/filters/url";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";

const pathnameMock = vi.fn(() => "/testops/coverage");

vi.mock("next/navigation", () => ({
	usePathname: () => pathnameMock(),
}));

vi.mock("next/link", () => ({
	default: ({
		href,
		children,
		...props
	}: {
		href: string;
		children: React.ReactNode;
		[key: string]: unknown;
	}) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

const defaultFilters: MetricFilter = defaultMetricFilter;

describe("activeTabFromPath", () => {
	it("resolves /testops/tests to 'tests'", () => {
		expect(activeTabFromPath("/testops/tests")).toBe("tests");
	});

	it("resolves /quality to 'quality'", () => {
		expect(activeTabFromPath("/quality")).toBe("quality");
	});

	it("resolves /testops/coverage to 'coverage'", () => {
		expect(activeTabFromPath("/testops/coverage")).toBe("coverage");
	});

	it("resolves a subpath of /testops/tests to 'tests'", () => {
		expect(activeTabFromPath("/testops/tests/detail")).toBe("tests");
	});

	it("resolves a subpath of /quality to 'quality'", () => {
		expect(activeTabFromPath("/quality/breakdown")).toBe("quality");
	});

	it("resolves a subpath of /testops/coverage to 'coverage'", () => {
		expect(activeTabFromPath("/testops/coverage/summary")).toBe("coverage");
	});

	it("falls back to 'coverage' for an unrecognised path", () => {
		expect(activeTabFromPath("/some/unknown/path")).toBe("coverage");
	});
});

describe("QualityCoverageTabs", () => {
	it("renders all three tab labels", () => {
		pathnameMock.mockReturnValue("/testops/coverage");
		render(<QualityCoverageTabs filters={defaultFilters} />);
		expect(screen.getByText("Tests")).toBeInTheDocument();
		expect(screen.getByText("Quality")).toBeInTheDocument();
		expect(screen.getByText("Coverage")).toBeInTheDocument();
	});

	it("all tabs are real links with filter params in their hrefs", () => {
		pathnameMock.mockReturnValue("/testops/coverage");
		render(<QualityCoverageTabs filters={defaultFilters} />);
		expect(screen.getByText("Tests").closest("a")).toHaveAttribute(
			"href",
			withFilterParam("/testops/tests", defaultFilters),
		);
		expect(screen.getByText("Quality").closest("a")).toHaveAttribute(
			"href",
			withFilterParam("/quality", defaultFilters),
		);
		expect(screen.getByText("Coverage").closest("a")).toHaveAttribute(
			"href",
			withFilterParam("/testops/coverage", defaultFilters),
		);
	});

	it("preserves active f and role params on all tab hrefs", () => {
		pathnameMock.mockReturnValue("/quality");
		const filters: MetricFilter = {
			...defaultMetricFilter,
			scope: { level: "team", ids: ["team-abc"] },
		};
		render(<QualityCoverageTabs filters={filters} role="eng-manager" />);

		const testsHref = screen.getByText("Tests").closest("a")?.getAttribute("href") ?? "";
		const qualityHref = screen.getByText("Quality").closest("a")?.getAttribute("href") ?? "";
		const coverageHref = screen.getByText("Coverage").closest("a")?.getAttribute("href") ?? "";

		// Every tab href must carry both f= and role=
		for (const href of [testsHref, qualityHref, coverageHref]) {
			const url = new URL(href, "http://localhost");
			expect(url.searchParams.get("f")).toBeTruthy();
			expect(url.searchParams.get("role")).toBe("eng-manager");
		}

		// Hrefs must match exactly what withFilterParam produces
		expect(testsHref).toBe(withFilterParam("/testops/tests", filters, "eng-manager"));
		expect(qualityHref).toBe(withFilterParam("/quality", filters, "eng-manager"));
		expect(coverageHref).toBe(withFilterParam("/testops/coverage", filters, "eng-manager"));
	});

	it("marks Tests as active on /testops/tests", () => {
		pathnameMock.mockReturnValue("/testops/tests");
		render(<QualityCoverageTabs filters={defaultFilters} />);
		expect(screen.getByText("Tests").closest("a")).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(screen.getByText("Quality").closest("a")).not.toHaveAttribute(
			"aria-current",
		);
		expect(screen.getByText("Coverage").closest("a")).not.toHaveAttribute(
			"aria-current",
		);
	});

	it("marks Quality as active on /quality", () => {
		pathnameMock.mockReturnValue("/quality");
		render(<QualityCoverageTabs filters={defaultFilters} />);
		expect(screen.getByText("Quality").closest("a")).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(screen.getByText("Tests").closest("a")).not.toHaveAttribute(
			"aria-current",
		);
		expect(screen.getByText("Coverage").closest("a")).not.toHaveAttribute(
			"aria-current",
		);
	});

	it("marks Coverage as active on /testops/coverage", () => {
		pathnameMock.mockReturnValue("/testops/coverage");
		render(<QualityCoverageTabs filters={defaultFilters} />);
		expect(screen.getByText("Coverage").closest("a")).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(screen.getByText("Tests").closest("a")).not.toHaveAttribute(
			"aria-current",
		);
		expect(screen.getByText("Quality").closest("a")).not.toHaveAttribute(
			"aria-current",
		);
	});

	it("exposes an accessible nav label", () => {
		pathnameMock.mockReturnValue("/testops/coverage");
		render(<QualityCoverageTabs filters={defaultFilters} />);
		expect(
			screen.getByRole("navigation", { name: "Tests, Quality, and Coverage" }),
		).toBeInTheDocument();
	});
});
