// @vitest-environment node
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { resolveServerTree } from "@/test/resolveServerTree";
import { track } from "@/test/stallFetch";

// CHAOS-9113: /code awaited ONE Promise.all of six calls. One slow call kept the whole page
// behind the loading skeleton. Each section now waits for its own reads only, and the page waits
// for the health gate alone.

const m = vi.hoisted(() => ({
    health: vi.fn(),
    home: vi.fn(),
    explain: vi.fn(),
    quadrant: vi.fn(),
    busFactor: vi.fn(),
    hotspots: vi.fn(),
}));

vi.mock("@/lib/logger", () => {
    const l = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn() };
    l.child.mockReturnValue(l);
    return { logger: l };
});
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: () => m.health() }));
vi.mock("@/lib/api/home", () => ({ getExplainData: () => m.explain() }));
vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: () => m.home() }));
vi.mock("@/lib/api/visuals", () => ({ getQuadrant: () => m.quadrant() }));
vi.mock("@/lib/api/code", () => ({
    getBusFactorData: () => m.busFactor(),
    getRepoTopHotspots: () => m.hotspots(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/shell/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/evidence/PageFactsEvidenceAction", () => ({
    PageFactsEvidenceAction: () => null,
}));
vi.mock("./ChurnTrend", () => ({ ChurnTrend: () => null }));
vi.mock("./RepoEvidenceButton", () => ({ RepoEvidenceButton: () => null }));
vi.mock("@/components/charts/QuadrantPanel", () => ({
    QuadrantPanel: () => <section data-testid="quadrant" />,
}));

import CodePage from "./page";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

/** The async section components of the page, each by name, with how they settle. */
function sections(root: ReactNode): ReactElement[] {
    const found: ReactElement[] = [];
    const walk = (node: ReactNode) => {
        if (!isValidElement(node)) return;
        const el = node as ReactElement<{ children?: ReactNode }>;
        if (typeof el.type === "function" && el.type.constructor.name === "AsyncFunction") {
            found.push(el);
            return;
        }
        for (const child of Children.toArray(el.props.children)) walk(child);
        // a slot prop (`actions={<Suspense>...}`) holds a section too
        for (const [key, value] of Object.entries(el.props)) {
            if (key !== "children") walk(value as ReactNode);
        }
    };
    walk(root);
    return found;
}

const nameOf = (el: ReactElement) => (el.type as { name: string }).name;

describe("/code sections stream apart", () => {
    it("returns after the health gate alone and draws each section when its own reads end", async () => {
        const busFactor = deferred<unknown>();
        m.health.mockResolvedValue({ ok: true });
        m.home.mockResolvedValue({ deltas: [] });
        m.explain.mockResolvedValue({ contributors: [], unit: "loc" });
        m.quadrant.mockResolvedValue(null);
        m.hotspots.mockResolvedValue([]);
        m.busFactor.mockReturnValue(busFactor.promise); // the one slow call (5 s in real life)

        const page = track(CodePage({ searchParams: Promise.resolve({}) }));
        await sleep(30);
        // RED on the old code: it waited for the slow call here and never settled.
        expect(page.settled).toBe(true);

        const all = sections(page.value as ReactNode);
        const state = new Map(
            all.map((el) => [nameOf(el), track(resolveServerTree(el) as Promise<unknown>)]),
        );
        await sleep(30);
        // Sections that do not need the slow read are drawn; the others still wait.
        expect(state.get("CodeQuadrantSection")?.settled).toBe(true);
        expect(state.get("CodeTilesSection")?.settled).toBe(false);
        expect(state.get("CodeTrendOwnershipSection")?.settled).toBe(false);
        expect(state.get("CodeRepoHotspotsSection")?.settled).toBe(false);
        expect(state.get("CodePageFactsAction")?.settled).toBe(false);

        busFactor.resolve(null);
        await sleep(30);
        expect([...state.values()].every((s) => s.settled)).toBe(true);
    });

    it("a failed health gate draws the unavailable page and no section", async () => {
        m.health.mockResolvedValue({ ok: false });
        m.home.mockResolvedValue(null);
        m.explain.mockResolvedValue(null);
        m.quadrant.mockResolvedValue(null);
        m.busFactor.mockResolvedValue(null);
        m.hotspots.mockResolvedValue(null);
        const ui = await CodePage({ searchParams: Promise.resolve({}) });
        expect(sections(ui as ReactNode)).toHaveLength(0);
    });
});
