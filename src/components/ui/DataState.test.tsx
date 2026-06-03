import { describe, it, expect } from "vitest";

import { DataState, type DataStateVariant } from "./DataState";
import { render, screen } from "@/test/utils";

const EMPTY_VARIANT_TITLES: Record<
	Exclude<DataStateVariant, "loading" | "error">,
	string
> = {
	"no-data-connected": "No data connected",
	"source-unsupported": "Source not supported yet",
	"detector-unavailable": "Connected but detector unavailable",
	"detector-enabled-no-findings": "Enabled but no findings",
	"insufficient-confidence": "Insufficient confidence",
	"preview-not-populated": "Preview not populated yet",
};

describe("DataState", () => {
	it.each(
		Object.entries(EMPTY_VARIANT_TITLES) as [DataStateVariant, string][],
	)("renders controlled taxonomy copy for the %s variant", (variant, title) => {
		render(<DataState variant={variant} />);
		const root = screen.getByTestId(`data-state-${variant}`);
		expect(root).toHaveAttribute("data-variant", variant);
		expect(screen.getByText(title)).toBeInTheDocument();
	});

	it("allows title and description overrides on empty variants", () => {
		render(
			<DataState
				variant="detector-enabled-no-findings"
				title="All quiet"
				description="Nothing surfaced for this team."
			/>,
		);
		expect(screen.getByText("All quiet")).toBeInTheDocument();
		expect(
			screen.getByText("Nothing surfaced for this team."),
		).toBeInTheDocument();
		// Default copy should be replaced, not appended.
		expect(
			screen.queryByText("Enabled but no findings"),
		).not.toBeInTheDocument();
	});

	it("renders an action node when provided", () => {
		render(
			<DataState
				variant="no-data-connected"
				action={<button type="button">Connect a source</button>}
			/>,
		);
		expect(screen.getByText("Connect a source")).toBeInTheDocument();
	});

	it("renders a loading state with an accessible busy status", () => {
		render(<DataState variant="loading" />);
		const root = screen.getByTestId("data-state-loading");
		expect(root).toHaveAttribute("data-variant", "loading");
		expect(root).toHaveAttribute("aria-busy", "true");
		expect(root).toHaveAttribute("role", "status");
	});

	it("renders an error state that is visually distinct from empty states", () => {
		const { container } = render(
			<DataState variant="error" title="Boom" message="It broke." />,
		);
		const root = screen.getByTestId("data-state-error");
		expect(root).toHaveAttribute("data-variant", "error");
		expect(screen.getByText("Boom")).toBeInTheDocument();
		expect(screen.getByText("It broke.")).toBeInTheDocument();
		// The error card carries the negative accent border, unlike the dashed
		// empty-state border — proving the two are not interchangeable.
		expect(
			container.querySelector(".border-\\(--accent-negative\\)\\/30"),
		).not.toBeNull();
		// No dashed empty-state container is rendered for the error variant.
		expect(container.querySelector(".border-dashed")).toBeNull();
	});

	it("falls back to description when no error message is given", () => {
		render(<DataState variant="error" description="Fallback detail." />);
		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
		expect(screen.getByText("Fallback detail.")).toBeInTheDocument();
	});

	it("honors a custom data-testid", () => {
		render(
			<DataState variant="insufficient-confidence" data-testid="panel-empty" />,
		);
		expect(screen.getByTestId("panel-empty")).toBeInTheDocument();
	});
});
