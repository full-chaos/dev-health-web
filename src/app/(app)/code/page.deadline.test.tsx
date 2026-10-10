// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { track } from "@/test/stallFetch";

// CHAOS-9103: /code awaits ONE Promise.all. One call that is accepted and never answered kept
// the whole document stream open. With a deadline the page settles and the section whose call
// timed out draws its existing no-data state; the other sections still draw.

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => {
    const l = { warn, info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn() };
    l.child.mockReturnValue(l);
    return { logger: l };
});
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/shell/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/evidence/PageFactsEvidenceAction", () => ({
    PageFactsEvidenceAction: () => null,
}));
vi.mock("./ChurnTrend", () => ({ ChurnTrend: () => null }));
vi.mock("./RepoEvidenceButton", () => ({ RepoEvidenceButton: () => null }));
vi.mock("@/components/charts/QuadrantPanel", () => ({
    QuadrantPanel: ({ data }: { data: unknown }) => (
        <section data-testid="quadrant">{data ? "quadrant-drawn" : "quadrant-no-data"}</section>
    ),
}));

import { overrideDeadlinesForTests } from "@/lib/serverDeadline";
import CodePage from "./page";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
    warn.mockClear();
    overrideDeadlinesForTests({ read: 60, health: 60, auth: 60, outerMargin: 1_500 });
});
afterEach(() => {
    overrideDeadlinesForTests(null);
    vi.unstubAllGlobals();
});

describe("/code with one call that never answers", () => {
    it("settles within the deadline and the quadrant section shows no-data", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                if (url.includes("/health")) {
                    return Promise.resolve(
                        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
                    );
                }
                if (url.includes("/quadrant")) {
                    // accepted, never answered; rejects only when the signal fires
                    return new Promise<Response>((_res, rej) => {
                        init?.signal?.addEventListener("abort", () => rej(init.signal!.reason));
                    });
                }
                return Promise.resolve(new Response("{}", { status: 404 }));
            }),
        );
        const started = Date.now();
        const state = track(CodePage({ searchParams: Promise.resolve({}) }));
        for (let i = 0; i < 1_500 && !state.settled; i += 1) await sleep(10);
        expect(state.settled).toBe(true);
        const html = renderToStaticMarkup(state.value as React.ReactElement);
        expect(html).toContain("quadrant-no-data");
        const lines = warn.mock.calls.filter(([, m]) => m === "server fetch deadline exceeded");
        expect(lines).toHaveLength(1);
        expect(lines[0][0]).toMatchObject({
            op: "GET /api/v1/quadrant",
            deadline_ms: 60,
            layer: "inner",
        });
    });
});
