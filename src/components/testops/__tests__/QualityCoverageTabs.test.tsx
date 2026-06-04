import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { QualityCoverageTabs, activeTabFromPath } from "../QualityCoverageTabs";

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
		render(<QualityCoverageTabs />);
		expect(screen.getByText("Tests")).toBeInTheDocument();
		expect(screen.getByText("Quality")).toBeInTheDocument();
		expect(screen.getByText("Coverage")).toBeInTheDocument();
	});

	it("all tabs are real links with the correct hrefs", () => {
		pathnameMock.mockReturnValue("/testops/coverage");
		render(<QualityCoverageTabs />);
		expect(screen.getByText("Tests").closest("a")).toHaveAttribute(
			"href",
			"/testops/tests",
		);
		expect(screen.getByText("Quality").closest("a")).toHaveAttribute(
			"href",
			"/quality",
		);
		expect(screen.getByText("Coverage").closest("a")).toHaveAttribute(
			"href",
			"/testops/coverage",
		);
	});

	it("marks Tests as active on /testops/tests", () => {
		pathnameMock.mockReturnValue("/testops/tests");
		render(<QualityCoverageTabs />);
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
		render(<QualityCoverageTabs />);
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
		render(<QualityCoverageTabs />);
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
		render(<QualityCoverageTabs />);
		expect(
			screen.getByRole("navigation", { name: "Tests, Quality, and Coverage" }),
		).toBeInTheDocument();
	});
});
