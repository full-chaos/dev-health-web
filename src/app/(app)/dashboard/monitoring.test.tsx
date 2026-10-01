import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { checkApiHealth, getApiMeta } from "@/lib/api/system";
import { getSetupStatus } from "@/lib/admin/server";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { DEFAULT_ROLE } from "@/lib/lensContext";

import Home from "./page";

// Pin tests for the Monitoring views card (CHAOS-7738, 5.1b): green before the restyle, kept green after.

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: vi.fn() }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn(), getApiMeta: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({ getSetupStatus: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { org_id: "org-1" } })) }));
vi.mock("@/components/home/AiWorkflowCallout", () => ({ AiWorkflowCallout: () => null }));
vi.mock("@/components/home/BackendBanner", () => ({ BackendBanner: () => null }));
vi.mock("@/components/home/CockpitClient", () => ({ CockpitClient: () => null }));
vi.mock("@/components/home/CockpitSummary", () => ({ CockpitSummary: () => null }));
vi.mock("@/components/home/DataConfidenceIndicator", () => ({
    DataConfidenceIndicator: () => null,
}));
vi.mock("@/components/home/InvestmentPreview", () => ({ InvestmentPreview: () => null }));
vi.mock("@/components/home/RankedSignals", () => ({ RankedSignals: () => null }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/onboarding/SetupBanner", () => ({ SetupBanner: () => null }));

beforeEach(() => {
    vi.mocked(checkApiHealth).mockResolvedValue({ ok: true, data: null });
    vi.mocked(getApiMeta).mockResolvedValue(null);
    vi.mocked(getSetupStatus).mockResolvedValue({ error: "not needed" });
    vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(null as never);
});

async function renderHome(params: Record<string, string> = {}) {
    render(await Home({ searchParams: Promise.resolve(params) }));
    const card = screen.getByText("Monitoring views").closest("section") as HTMLElement;
    const links = [...card.querySelectorAll("a")];
    return { card, links };
}

const segmentIds = (links: HTMLAnchorElement[]) =>
    links
        .filter((a) => a.getAttribute("href")?.includes("tab="))
        .slice(1) // the first link is the section's own "Open metrics" (tab=dora)
        .map((a) => /tab=([a-z]+)/.exec(a.getAttribute("href") ?? "")?.[1]);

describe("Monitoring views card pinned (CHAOS-7738)", () => {
    it.each([
        ["neutral", {}, ["flow", "throughput", "dora"]],
        ["ic", { lens: "ic" }, ["flow", "throughput", "dora"]],
        ["em", { lens: "em" }, ["flow", "throughput", "dora"]],
        ["pm", { lens: "pm" }, ["flow", "throughput", "dora"]],
        ["leadership", { lens: "leadership" }, ["throughput", "dora", "flow"]],
    ] as const)("%s lens orders the three views %j", async (_name, params, expected) => {
        const { links } = await renderHome({ ...params });
        expect(segmentIds(links as HTMLAnchorElement[])).toEqual([...expected]);
    });

    it("has the heading, the line under it and the Open metrics link to the DORA tab", async () => {
        const { card, links } = await renderHome();
        expect(card).toHaveTextContent("Monitoring views");
        expect(card).toHaveTextContent("Tabs for steady trend monitoring.");
        const openMetrics = links.find((a) => a.textContent === "Open metrics");
        const href = openMetrics?.getAttribute("href") ?? "";
        expect(href.startsWith("/metrics?tab=dora&f=")).toBe(true);
        expect(href).toContain(`role=${DEFAULT_ROLE}`);
    });

    it("each view links to its tab with the filter and the role, and shows its label, description and focus", async () => {
        const { card, links } = await renderHome({ lens: "em" });
        for (const [id, label, description, focus] of [
            [
                "dora",
                "DORA",
                "Release speed and stability.",
                "Deploy frequency, cycle time, failure rate.",
            ],
            ["flow", "Flow", "Idea to merge insight.", "Review latency, throughput, WIP."],
            [
                "throughput",
                "Throughput",
                "Delivery volume and pacing.",
                "Throughput, WIP saturation, blocked work.",
            ],
        ]) {
            const link = links.find(
                (a) =>
                    a.getAttribute("href")?.includes(`tab=${id}`) &&
                    a.textContent?.includes(description),
            );
            expect(link, id).toBeTruthy();
            expect(link?.getAttribute("href")).toContain("role=em");
            expect(link?.getAttribute("href")).toContain("f=");
            expect(link).toHaveTextContent(label);
            expect(link).toHaveTextContent(focus);
        }
        expect(card).toBeInTheDocument();
    });
});
