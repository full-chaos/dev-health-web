import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import { renderWithEvidenceDrawer } from "@/test/evidenceDrawer";
import { screen, waitFor } from "@/test/utils";

import { EvidencePanel } from "./EvidencePanel";

vi.mock("@/lib/api/home", () => ({ getExplainData: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn() }),
}));

// CHAOS-9133: a blank Home summary sentence is not an evidence row.
const filters = {
    scope: { level: "org", ids: ["o"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const open = async (texts: Array<string | null>) => {
    const body = {
        summary: texts.map((text, i) => ({ id: `s${i}`, text, evidence_link: "/x" })),
        tiles: {},
        constraint: null,
        events: [],
        freshness: {
            last_ingested_at: null,
            latest_successful_sync_at: null,
            sources: {},
            coverage: null,
        },
        deltas: [],
        signals: [],
    };
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify(body),
            json: async () => body,
        }),
    );
    renderWithEvidenceDrawer(
        <EvidencePanel
            isOpen
            onCloseAction={() => undefined}
            title="Notable Shift"
            apiUrl="/api/v1/home"
            filters={filters}
        />,
    );
    await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());
    await screen.findByText("Notable Shift");
};

afterEach(() => vi.unstubAllGlobals());

describe("EvidencePanel Home evidence with a blank sentence", () => {
    it.each([
        ["empty", [""]],
        ["null", [null]],
        ["whitespace", ["  "]],
    ])("%s draws no Home summary row", async (_n, texts) => {
        await open(texts);
        expect(screen.queryByText("Home summary")).toBeNull();
        expect(screen.getByText(/No contributing artifacts were returned/)).toBeInTheDocument();
    });

    it("keeps a real sentence as one row", async () => {
        await open(["", "Throughput rose 100%."]);
        expect(screen.getAllByText("Home summary")).toHaveLength(1);
        expect(screen.getAllByText("Throughput rose 100%.").length).toBeGreaterThan(0);
    });
});
