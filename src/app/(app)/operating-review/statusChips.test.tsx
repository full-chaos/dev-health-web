import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { STATUS_PILL, type StatusPillTone } from "@/lib/statusPill";
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

// CHAOS-7884: the Operating Review chips and the AI-workflow highlight use theme
// tokens. The chip tint is the status pill's fill and text WITHOUT its border (the
// chips never had one), derived from STATUS_PILL so the two cannot drift.

const metric = (key: string, status: string) => ({
    key,
    label: `Label ${key}`,
    value: 5,
    unit: "",
    delta: { value: 5, priorValue: 4, absolute: 1, percent: 25, status },
});
const review = {
    orgId: "org-1",
    teamId: null,
    weekStart: "2026-09-28",
    priorWeekStart: "2026-09-21",
    recommendations: [],
    recommendationsEmptyState: "none",
    sections: [
        {
            key: "delivery_movement",
            title: "Delivery movement",
            metrics: [
                metric("a", "improved"),
                metric("b", "worsened"),
                metric("c", "changed"),
                metric("d", "unchanged"),
            ],
            improved: ["i1"],
            worsened: ["w1", "w2"],
            changed: ["c1", "c2", "c3"],
        },
        {
            key: "ai_workflow_intelligence",
            title: "AI workflow intelligence",
            metrics: [],
            improved: [],
            worsened: [],
            changed: [],
        },
    ],
} as unknown as OperatingReview;

const parts = (tone: StatusPillTone) => {
    const [, fill, text] = STATUS_PILL[tone].split(" ");
    return { fill, text };
};

const RAW = /(?:bg|text|border|shadow)-(?:sky|emerald|rose|red|green|blue|amber)-\d{2,3}/u;

async function renderPage() {
    return render(await OperatingReviewPage({ searchParams: Promise.resolve({}) }));
}

beforeEach(() => {
    reviewMock.review = review;
});

describe("Operating Review status chips use theme tokens", () => {
    it.each([
        ["improved", "positive"],
        ["worsened", "negative"],
        ["changed", "info"],
    ] as const)(
        "the %s chips are the %s tint with no border and no dark: class",
        async (word, tone) => {
            await renderPage();

            const chips = [
                screen.getAllByText(new RegExp(`^\\d+ ${word}$`), { selector: "span" })[0],
                screen.getAllByText(word, { selector: "span" })[0],
            ];
            for (const chip of chips) {
                expect(chip.className).toContain(parts(tone).fill);
                expect(chip.className).toContain(parts(tone).text);
                expect(chip.className).not.toMatch(/(^|\s)border/u);
                expect(chip.className).not.toContain("dark:");
                expect(chip.className).not.toMatch(RAW);
            }
        },
    );

    it("keeps an unknown status neutral", async () => {
        await renderPage();

        const chip = screen.getByText("unchanged", { selector: "span" });
        expect(chip.className).toContain("bg-muted");
        expect(chip.className).toContain("text-muted-foreground");
    });

    it("keeps the chip texts (counts and status words)", async () => {
        await renderPage();

        const section = screen
            .getAllByRole("heading", { name: "Delivery movement" })[1]
            .closest("section") as HTMLElement;
        expect(within(section).getByText("1 improved")).toBeInTheDocument();
        expect(within(section).getByText("2 worsened")).toBeInTheDocument();
        expect(within(section).getByText("3 changed")).toBeInTheDocument();
    });
});

describe("Operating Review AI-workflow highlight uses the info token", () => {
    it("the agenda card, the section and the callout carry info classes and no raw palette", async () => {
        const { container } = await renderPage();

        const callout = screen.getByTestId("operating-review-ai-workflow-callout");
        expect(callout.className).toContain("border-(--info)/30");
        expect(callout.className).toContain("bg-(--info)/5");
        for (const link of within(callout).getAllByRole("link")) {
            expect(link.className).toContain("border-(--info)/30");
        }
        const highlighted = container.querySelectorAll("[class*='border-(--info)/40']");
        expect(highlighted.length).toBe(2);
        expect(container.innerHTML).not.toMatch(RAW);
    });
});
