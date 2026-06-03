import { describe, it, expect } from "vitest";

import { AiWorkflowCallout } from "./AiWorkflowCallout";
import { render, screen } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";

const filters: MetricFilter = {
	scope: { level: "team", ids: ["team-1"] },
	time: { range_days: 14, compare_days: 0 },
	who: {},
	what: {},
	why: {},
	how: {},
};

describe("AiWorkflowCallout", () => {
	it("renders the full prominent section when AI is dominant", () => {
		render(<AiWorkflowCallout filters={filters} activeRole="ic" prominent />);
		expect(screen.getByTestId("ai-workflow-callout")).toBeInTheDocument();
		expect(screen.getByText("AI Workflow Intelligence")).toBeInTheDocument();
		// All four workflow steps render as links.
		expect(screen.getByText("AI Impact")).toBeInTheDocument();
		expect(screen.getByText("Governance gaps")).toBeInTheDocument();
		expect(
			screen.queryByTestId("ai-workflow-secondary-link"),
		).not.toBeInTheDocument();
	});

	it("reduces to a single secondary link when AI is not dominant", () => {
		render(
			<AiWorkflowCallout filters={filters} activeRole="ic" prominent={false} />,
		);
		expect(
			screen.getByTestId("ai-workflow-secondary-link"),
		).toBeInTheDocument();
		// AI remains reachable via a direct link.
		const link = screen.getByRole("link", { name: /open ai workflows/i });
		expect(link.getAttribute("href")).toContain("/ai");
		// The heavy section is gone.
		expect(screen.queryByTestId("ai-workflow-callout")).not.toBeInTheDocument();
		expect(
			screen.queryByText("AI Workflow Intelligence"),
		).not.toBeInTheDocument();
	});
});
