import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";
import type { AreaSignal } from "@/lib/areaSignals/types";

import AIWorkflowsPage from "./page";

// The AI overview cards, with real card components and given signals. Pins what the
// page shows today so the page pass cannot change a state, a value, a link or an order.

const F = encodeFilterParam(defaultMetricFilter);

const signals = vi.hoisted(() => ({ current: [] as AreaSignal[] }));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock("@/components/shell/PageHeader", () => ({
    PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
        <>
            <h1>{title}</h1>
            <div data-testid="page-actions">{actions}</div>
        </>
    ),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <section /> }));
vi.mock("@/lib/areaSignals", () => ({
    getAreaSignals: vi.fn(async () => signals.current),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "true" }),
}));

const sig = (
    id: string,
    label: string,
    cluster: string,
    state: AreaSignal["state"],
    value: string,
): AreaSignal => ({
    id,
    label,
    href: `/ai/${id}`,
    cluster,
    metricLabel: `${label} metric`,
    value,
    state,
});

async function renderPage() {
    return render(await AIWorkflowsPage({ searchParams: Promise.resolve({ f: F, role: "em" }) }), {
        wrapper: EvidenceDrawerProvider,
    });
}

const cards = () => screen.getAllByTestId("area-signal-card");

beforeEach(() => {
    signals.current = [
        sig("impact", "Impact", "Signal", "low", "40% AI-assisted"),
        sig("review", "Review Load", "Signal", "high", "2.4× amplification"),
        sig("risk", "Governance Risk", "Signal", "unavailable", ""),
        sig("auto", "Automations", "Action", "neutral", "3 opportunities"),
    ];
});

describe("AI overview cards", () => {
    it("shows the page title, the eyebrow and the line above the cards", async () => {
        await renderPage();
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("AI");
        expect(
            screen.getByText(
                "Available AI views summarize impact, review pressure, governance risk, and automation opportunities.",
            ),
        ).toBeInTheDocument();
    });

    it("shows all four cards once, each with its state and value", async () => {
        await renderPage();
        expect(
            cards()
                .map((c) => c.getAttribute("data-signal-id"))
                .sort(),
        ).toEqual(["auto", "impact", "review", "risk"]);
        const review = cards().find((c) => c.getAttribute("data-signal-id") === "review")!;
        expect(within(review).getByTestId("area-signal-badge")).toHaveTextContent("High");
        expect(within(review).getByTestId("area-signal-value")).toHaveTextContent(
            "2.4× amplification",
        );
        const risk = cards().find((c) => c.getAttribute("data-signal-id") === "risk")!;
        expect(risk).toHaveAttribute("data-state", "unavailable");
        expect(within(risk).queryByTestId("area-signal-value")).toBeNull();
    });

    it("sorts by severity and puts the unavailable card last, in each group", async () => {
        await renderPage();
        const groups = screen.getAllByTestId("area-hub-cluster");
        const ids = (g: HTMLElement) =>
            within(g)
                .getAllByTestId("area-signal-card")
                .map((c) => c.getAttribute("data-signal-id"));
        expect(groups.map((g) => g.getAttribute("data-cluster"))).toEqual(["Signal", "Action"]);
        expect(ids(groups[0])).toEqual(["review", "impact", "risk"]);
        expect(ids(groups[1])).toEqual(["auto"]);
    });

    it("has no hero above the groups, and no frame card around them", async () => {
        await renderPage();
        expect(screen.queryByTestId("area-overview-hero")).toBeNull();
        expect(screen.getByTestId("area-hub").className).not.toMatch(/border|bg-/);
    });

    it("shows the driver line only on Impact, with the number that sets its state", async () => {
        signals.current[0] = {
            ...signals.current[0],
            driver: "Rework drag 12% · AI-assisted work",
        };
        await renderPage();
        const drivers = screen.getAllByTestId("area-signal-driver");
        expect(drivers).toHaveLength(1);
        expect(drivers[0]).toHaveTextContent("Rework drag 12% · AI-assisted work");
        expect(drivers[0].closest("[data-signal-id]")).toHaveAttribute("data-signal-id", "impact");
    });

    it("has a View evidence action in the header that opens the page facts in the cards' order", async () => {
        await renderPage();
        const action = within(screen.getByTestId("page-actions")).getByTestId(
            "page-header-view-evidence",
        );
        fireEvent.click(action);
        const facts = await screen.findByTestId("page-evidence-facts");
        const text = facts.textContent ?? "";
        expect(text.indexOf("Review Load")).toBeLessThan(text.indexOf("Impact"));
        expect(text.indexOf("Impact")).toBeLessThan(text.indexOf("Governance Risk"));
        expect(text.indexOf("Governance Risk")).toBeLessThan(text.indexOf("Automations"));
        expect(within(facts).getByText("Unknown")).toBeInTheDocument();
    });

    it("emphasizes the most severe severity-bearing card, once", async () => {
        await renderPage();
        const emphasized = cards().filter((c) => c.getAttribute("data-emphasized") === "true");
        expect(emphasized.map((c) => c.getAttribute("data-signal-id"))).toEqual(["review"]);
    });

    it("every card links to its destination with the filter and the role", async () => {
        await renderPage();
        for (const c of cards()) {
            const url = new URL(c.getAttribute("href") ?? "", "https://x");
            expect(url.pathname).toBe(`/ai/${c.getAttribute("data-signal-id")}`);
            expect(url.searchParams.get("f")).toBeTruthy();
            expect(url.searchParams.get("role")).toBe("em");
        }
    });
});
