import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@/test/utils";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";
import { GlobalContextBar } from "./GlobalContextBar";

const mockReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
	useRouter: () => ({
		replace: mockReplace,
	}),
	usePathname: () => "/work",
	useSearchParams: () => ({
		toString: () => currentSearchParams.toString(),
	}),
}));

vi.mock("next-auth/react", () => ({
	useSession: () => ({ data: null, status: "unauthenticated" }),
}));

// Team/Repo option lists are sourced from the shared filter-options hook (the
// same source the page FilterBar uses). Stub it so the selectors render
// deterministic choices without hitting the backend.
vi.mock("@/components/filters/useFilterOptions", () => ({
	useFilterOptions: () => ({
		teams: ["Platform", "Mobile"],
		repos: ["org/api", "org/ui"],
		services: [],
		developers: [],
		work_category: [],
		issue_type: [],
		flow_stage: [],
	}),
}));

/** Decode the filter param from the most recent router.replace call. */
const lastFilter = (): MetricFilter => {
	const nextUrl = mockReplace.mock.calls.at(-1)?.[0] as string;
	const encoded = new URL(nextUrl, "https://dev-health.test").searchParams.get(
		"f",
	);
	return decodeFilter(encoded);
};

beforeEach(() => {
	mockReplace.mockClear();
	currentSearchParams = new URLSearchParams("role=em");
});

describe("GlobalContextBar", () => {
	it("renders org, team, window, and repo context", () => {
		render(<GlobalContextBar filters={defaultMetricFilter} />);

		expect(screen.getByLabelText("Global context")).toBeInTheDocument();
		expect(screen.getByText("Org")).toBeInTheDocument();
		expect(screen.getByText("Team")).toBeInTheDocument();
		expect(screen.getByText("Window")).toBeInTheDocument();
		expect(screen.getByText("Repo")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "14d" })).toBeInTheDocument();
	});

	it("updates the shared filter param when a window changes", () => {
		render(<GlobalContextBar filters={defaultMetricFilter} />);

		fireEvent.click(screen.getByRole("button", { name: "30d" }));

		const nextUrl = mockReplace.mock.calls.at(-1)?.[0] as string;
		expect(nextUrl).toMatch(/^\/work\?/);
		expect(nextUrl).toContain("role=em");
		expect(lastFilter().time.range_days).toBe(30);
	});

	it("writes the chosen team into scope.ids when a team is selected", () => {
		render(<GlobalContextBar filters={defaultMetricFilter} />);

		// Open the Team selector and pick a specific team.
		fireEvent.click(screen.getByRole("button", { name: /Team/ }));
		fireEvent.click(screen.getByRole("checkbox", { name: "Platform" }));

		expect(lastFilter().scope).toEqual({ level: "team", ids: ["Platform"] });
	});

	it("writes the chosen repos into what.repos when a repo is selected", () => {
		render(<GlobalContextBar filters={defaultMetricFilter} />);

		fireEvent.click(screen.getByRole("button", { name: /Repo/ }));
		fireEvent.click(screen.getByRole("checkbox", { name: "org/api" }));

		expect(lastFilter().what.repos).toEqual(["org/api"]);
	});

	it("clears the repo selection when 'All' is chosen", () => {
		const filtersWithRepo: MetricFilter = {
			...defaultMetricFilter,
			what: { ...defaultMetricFilter.what, repos: ["org/api"] },
		};
		render(<GlobalContextBar filters={filtersWithRepo} />);

		// The trigger reflects the active selection before clearing.
		expect(
			screen.getByRole("button", { name: /org\/api/ }),
		).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Repo/ }));
		fireEvent.click(screen.getByRole("checkbox", { name: "All" }));

		expect(lastFilter().what.repos).toEqual([]);
	});

	it("renders the Lens selector in the global context bar", () => {
		render(<GlobalContextBar filters={defaultMetricFilter} />);

		expect(screen.getByTestId("lens-selector")).toBeInTheDocument();
		// The bar has role=em in searchParams so the legacy alias is resolved.
		expect(screen.getByText("Lens")).toBeInTheDocument();
	});

	it("preserves existing query params (role=em) when filter changes", () => {
		render(<GlobalContextBar filters={defaultMetricFilter} />);

		fireEvent.click(screen.getByRole("button", { name: "30d" }));

		const nextUrl = mockReplace.mock.calls.at(-1)?.[0] as string;
		expect(nextUrl).toContain("role=em");
	});
});
