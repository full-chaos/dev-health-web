/** Govern overview page: the approved layout (hero, then the QUALITY and RISK card groups). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import { getAreaById } from "@/lib/navigation/areas";
import type { AreaSignal, AreaSignalState } from "@/lib/areaSignals/types";

import GovernPage from "./page";

const getGovernSignalsMock = vi.hoisted(() => vi.fn());

const envRef = vi.hoisted(() => ({ testMode: "true" }));
const requireSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireSession: requireSessionMock }));
beforeEach(() => requireSessionMock.mockResolvedValue({ user: { org_id: "org-1" } }));
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
vi.mock("next/navigation", () => ({
    usePathname: () => "/govern",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/shell/ScopeBar", () => ({
    ScopeBar: () => <section data-testid="scope-bar" />,
}));
vi.mock("@/lib/areaSignals", () => ({ getGovernSignals: getGovernSignalsMock }));
// The header action opens the shared drawer; here its facts are drawn in place.
vi.mock("@/components/evidence/PageFactsEvidenceAction", () => ({
    PageFactsEvidenceAction: ({
        title,
        facts,
    }: {
        title: string;
        facts: Array<{ label: string; value?: React.ReactNode }>;
    }) => (
        <ul data-testid="page-evidence" data-title={title}>
            {facts.map((fact) => (
                <li key={fact.label} data-testid="page-fact">
                    {fact.label}={fact.value ?? "Not reported"}
                </li>
            ))}
        </ul>
    ),
}));

vi.mock("@/lib/testops/fetchers", () => ({
    fetchTestOpsData: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: envRef.testMode }),
}));

/**
 * One signal per Govern destination, built from the REAL nav descriptors (label, href, cluster,
 * demoted), as the resolver does. Only the state and the value are test data.
 */
function governSignals(states: Record<string, AreaSignalState>): AreaSignal[] {
    const area = getAreaById("govern");
    if (!area) throw new Error("missing govern area");
    return area.hubItems.map((item) => {
        const state = states[item.id] ?? "low";
        return {
            id: item.id,
            label: item.label,
            href: item.href,
            cluster: item.cluster,
            metricLabel: item.metricLabel ?? item.label,
            value: state === "unavailable" ? "" : "7",
            state,
            demoted: item.demoted,
        };
    });
}

async function renderPage() {
    return render(await GovernPage({ searchParams: Promise.resolve({}) }));
}

const clusterIds = (name: string) => {
    const group = screen
        .getAllByTestId("area-overview-cluster")
        .find((node) => node.getAttribute("data-cluster") === name);
    if (!group) throw new Error(`missing group ${name}`);
    return within(group)
        .getAllByTestId("area-signal-card")
        .map((card) => card.getAttribute("data-signal-id"));
};

beforeEach(() => {
    getGovernSignalsMock.mockReset();
});
afterEach(cleanup);

describe("Govern overview page — approved layout", () => {
    it("draws the primary-signal hero, then the QUALITY group and the RISK group", async () => {
        getGovernSignalsMock.mockResolvedValue(governSignals({ security: "critical" }));
        await renderPage();

        // Hero = the most severe served signal (Security here); it is not repeated in a group.
        const hero = screen.getByTestId("area-overview-hero");
        expect(within(hero).getByTestId("area-signal-card")).toHaveAttribute(
            "data-signal-id",
            "security",
        );
        expect(within(hero).getByText("Primary signal")).toBeInTheDocument();

        const groups = screen.getAllByTestId("area-overview-cluster");
        expect(groups.map((group) => group.getAttribute("data-cluster"))).toEqual([
            "Quality",
            "Risk",
        ]);
        // Each group has its head and its own card grid.
        // (The Quality card's own title is an h3; the group head is the paragraph.)
        expect(within(groups[0]).getByText("Quality", { selector: "p" })).toBeInTheDocument();
        expect(within(groups[1]).getByText("Risk", { selector: "p" })).toBeInTheDocument();
        expect(clusterIds("Quality")).toEqual(["testops", "quality"]);
        // Equal severity: the approved order (Delivery Risk, Compounding Risk, Incident
        // Correlation, Feature Flags).
        expect(clusterIds("Risk")).toEqual([
            "risk",
            "risk-compounding",
            "incident-correlation",
            "feature-flags",
        ]);
    });

    it("draws Feature Flags as a normal 4th Risk card, the same card as its siblings", async () => {
        getGovernSignalsMock.mockResolvedValue(governSignals({ security: "critical" }));
        await renderPage();

        const card = (id: string) => {
            const found = screen
                .getAllByTestId("area-signal-card")
                .find((node) => node.getAttribute("data-signal-id") === id);
            if (!found) throw new Error(`missing card ${id}`);
            return found;
        };
        const flags = card("feature-flags");
        expect(flags).toHaveAttribute("data-demoted", "false");
        // Same card chrome and the same value size as a sibling Risk card.
        expect(flags.className).toBe(card("risk").className);
        expect(within(flags).getByTestId("area-signal-value").className).toBe(
            within(card("risk")).getByTestId("area-signal-value").className,
        );
        expect(flags).toHaveAttribute("href", expect.stringContaining("/feature-flags"));
    });

    it("sorts a more severe card first inside its group (production severity order stays)", async () => {
        getGovernSignalsMock.mockResolvedValue(
            governSignals({ security: "critical", "feature-flags": "high" }),
        );
        await renderPage();
        expect(clusterIds("Risk")).toEqual([
            "feature-flags",
            "risk",
            "risk-compounding",
            "incident-correlation",
        ]);
    });

    it("has no section title over the groups (no 'Related workflows' block)", async () => {
        getGovernSignalsMock.mockResolvedValue(governSignals({ security: "critical" }));
        await renderPage();
        expect(screen.queryByText(/Related workflows/i)).toBeNull();
        expect(screen.queryByText(/ordered by severity/i)).toBeNull();
    });

    it("keeps every Govern destination reachable from the page", async () => {
        getGovernSignalsMock.mockResolvedValue(governSignals({ security: "critical" }));
        await renderPage();
        const hrefs = screen
            .getAllByRole("link")
            .map((link) => (link.getAttribute("href") ?? "").split("?")[0]);
        for (const path of [
            "/testops",
            "/quality",
            "/security",
            "/testops/risk",
            "/risk/compounding",
            "/incident-correlation",
            "/feature-flags",
        ]) {
            expect(hrefs).toContain(path);
        }
    });

    it("shows the hero's visible primary button, arrow first, to the hero destination (ruling 93)", async () => {
        getGovernSignalsMock.mockResolvedValue(governSignals({ security: "critical" }));
        await renderPage();
        const hero = screen.getByTestId("area-overview-hero");
        const button = within(hero).getByRole("link", { name: "Inspect security" });
        expect(button.getAttribute("href")?.split("?")[0]).toBe("/security");
        expect(button.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    });

    it("draws QUALITY above RISK even when a Risk card is the most severe after the hero", async () => {
        getGovernSignalsMock.mockResolvedValue(
            governSignals({
                security: "critical",
                "risk-compounding": "critical",
                testops: "low",
                quality: "low",
            }),
        );
        await renderPage();
        expect(
            screen
                .getAllByTestId("area-overview-cluster")
                .map((group) => group.getAttribute("data-cluster")),
        ).toEqual(["Quality", "Risk"]);
        // The hero choice is unchanged by the group order.
        expect(
            within(screen.getByTestId("area-overview-hero")).getByTestId("area-signal-card"),
        ).toHaveAttribute("data-signal-id", "security");
        expect(clusterIds("Risk")[0]).toBe("risk-compounding");
    });

    it("lists the 'View evidence' facts in the order the page draws the cards, for every state mix", async () => {
        const mixes: Array<Record<string, AreaSignalState>> = [
            { security: "critical" },
            // All equal: the area's own order decides.
            {},
            // A Risk card is the most severe after the hero.
            { security: "critical", "risk-compounding": "critical", quality: "low" },
            // Cards without a served value sink to the end of their group.
            { risk: "high", testops: "unavailable", "feature-flags": "unavailable" },
            // A Risk card is the hero; Quality still comes first in the grid.
            { "incident-correlation": "critical", testops: "medium" },
            // Nothing served: no hero, every card in the grid.
            Object.fromEntries(
                (getAreaById("govern")?.hubItems ?? []).map((item) => [item.id, "unavailable"]),
            ),
        ];
        for (const states of mixes) {
            const signals = governSignals(states);
            getGovernSignalsMock.mockResolvedValue(signals);
            await renderPage();
            const idByLabel = new Map(
                signals.map((signal) => [`${signal.label} — ${signal.metricLabel}`, signal.id]),
            );
            const factIds = within(screen.getByTestId("page-evidence"))
                .getAllByTestId("page-fact")
                .map((li) => idByLabel.get((li.textContent ?? "").split("=")[0]));
            const drawnIds = screen
                .getAllByTestId("area-signal-card")
                .map((card) => card.getAttribute("data-signal-id"));
            expect(factIds, JSON.stringify(states)).toEqual(drawnIds);
            expect(factIds).toHaveLength(signals.length);
            cleanup();
        }
    });

    it("gives the header a 'View evidence' with the served signals in body order (hero, Quality, Risk)", async () => {
        getGovernSignalsMock.mockResolvedValue(
            governSignals({
                security: "critical",
                "risk-compounding": "high",
                testops: "low",
                quality: "medium",
                "feature-flags": "unavailable",
            }),
        );
        await renderPage();
        const evidence = screen.getByTestId("page-evidence");
        expect(evidence).toHaveAttribute("data-title", "Govern overview");
        expect(
            within(evidence)
                .getAllByTestId("page-fact")
                .map((li) => li.textContent),
        ).toEqual([
            "Security — Open criticals=7",
            "Quality — Change failure rate=7",
            "TestOps — Worst TestOps signal=7",
            "Compounding Risk — Worst risk score=7",
            "Delivery Risk — Release confidence=7",
            "Incident Correlation — Change failure rate=7",
            "Feature Flags — Active flags=Not reported",
        ]);
    });
});

describe("GovernPage org scope (CHAOS-8272)", () => {
    it("shows one plain sentence and makes no request when the session has no org", async () => {
        envRef.testMode = "false";
        requireSessionMock.mockResolvedValue({ user: {} });
        const { fetchTestOpsData: spy } = await import("@/lib/testops/fetchers");
        vi.mocked(spy).mockClear();
        render(await GovernPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByText(/no organization selected/i)).toBeInTheDocument();
        expect(vi.mocked(spy)).not.toHaveBeenCalled();
        envRef.testMode = "true";
    });
});
