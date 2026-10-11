import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import type { OperatingReview } from "@/lib/graphql/types";

const reviewMock = vi.hoisted(() => ({ review: null as unknown }));

vi.mock("next/navigation", () => ({
    usePathname: () => "/operating-review",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div /> }));
vi.mock("@/components/shell/PageHeader", () => ({
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/graphql/operatingReviewFetchers", () => ({
    getOperatingReviewViaGraphQL: vi.fn(async () => reviewMock.review),
}));

import OperatingReviewPage from "./page";

// The investment section serves the five canonical themes (unit "effort"). The web
// draws the served rows as they come; only the section text names the set.

const THEMES = [
    ["feature_delivery_effort", "Feature delivery"],
    ["operational_effort", "Operational / support"],
    ["maintenance_effort", "Maintenance / tech debt"],
    ["quality_effort", "Quality / reliability"],
    ["risk_effort", "Risk / security"],
] as const;

describe("Operating Review investment section text", () => {
    it("names the five investment themes and drops the old four-way set", async () => {
        reviewMock.review = {
            orgId: "org-1",
            teamId: null,
            weekStart: "2026-09-28",
            priorWeekStart: "2026-09-21",
            recommendations: [],
            recommendationsEmptyState: "none",
            sections: [
                {
                    key: "investment",
                    title: "Investment",
                    metrics: THEMES.map(([key, label]) => ({
                        key,
                        label,
                        value: 10,
                        unit: "effort",
                        delta: {
                            value: 10,
                            priorValue: 8,
                            absolute: 2,
                            percent: 25,
                            status: "changed",
                        },
                    })),
                    improved: [],
                    worsened: [],
                    changed: [],
                },
            ],
        } as unknown as OperatingReview;

        const { container } = render(
            await OperatingReviewPage({ searchParams: Promise.resolve({}) }),
        );

        const section = container.querySelector("#investment") as HTMLElement;
        expect(section).toHaveTextContent("Effort allocation across the five investment themes.");
        expect(section).not.toHaveTextContent(/KTLO|new-value|infrastructure/i);
        for (const [, label] of THEMES) expect(section).toHaveTextContent(label);
    });
});
