import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { EvidenceView } from "./EvidenceView";
import type { MetricFilter } from "@/lib/filters/types";

const filters: MetricFilter = {
    scope: { level: "repo", ids: ["repo-a"] },
    time: {
        range_days: 30,
        compare_days: 30,
        start_date: undefined,
        end_date: undefined,
    },
    who: {},
    what: {},
    why: {},
    how: {},
};

describe("EvidenceView", () => {
    it("renders one associations inspection action for the combined evidence view", () => {
        render(<EvidenceView filters={filters} wipExplain={null} blockedExplain={null} />);

        expect(screen.getAllByRole("link", { name: /inspect associations/i })).toHaveLength(1);
    });
});

describe("EvidenceView strings (pin, CHAOS-7749)", () => {
    it("keeps both card titles, the WIP-only action and the empty texts", () => {
        render(<EvidenceView filters={filters} wipExplain={null} blockedExplain={null} />);
        expect(screen.getByRole("heading", { name: "WIP Associations" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Blocked Associations" })).toBeInTheDocument();
        expect(screen.getAllByRole("link", { name: /inspect associations/i })).toHaveLength(1);
        expect(
            screen.getByText("WIP association detail will appear once data is ingested."),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Blocked association detail will appear once data is ingested."),
        ).toBeInTheDocument();
    });

    it("renders driver rows as links with the signed delta", () => {
        const explain = {
            drivers: [{ id: "d1", label: "Driver one", delta_pct: 12, evidence_link: "/api/x" }],
        } as never;
        render(<EvidenceView filters={filters} wipExplain={explain} blockedExplain={null} />);
        const row = screen.getByRole("link", { name: /Driver one/u });
        expect(row).toHaveAttribute("href");
        expect(row).toHaveTextContent("Driver one");
    });
});
