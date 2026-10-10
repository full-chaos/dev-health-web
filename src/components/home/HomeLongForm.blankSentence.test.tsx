import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer } from "@/test/evidenceDrawer";
import type { MetricFilter } from "@/lib/filters/types";
import type { HomeResponse } from "@/lib/types";

import { HomeLongForm } from "./HomeLongForm";

vi.mock("next/navigation", () => ({
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn() }),
}));

// CHAOS-9133: a blank Home summary sentence draws nothing (no empty button).
const filters = {
    scope: { level: "org", ids: ["o"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const home = (texts: Array<string | null>) =>
    ({
        summary: texts.map((text, i) => ({ id: `s${i}`, text, evidence_link: "/x" })),
        tiles: {},
    }) as unknown as HomeResponse;

const section = (texts: Array<string | null>) => {
    const { container } = renderWithEvidenceDrawer(
        <HomeLongForm home={home(texts)} filters={filters} activeRole="em" />,
    );
    return container.querySelector('[data-testid="long-form-notable-shifts"]') as HTMLElement;
};

describe("HomeLongForm blank summary sentence", () => {
    it.each([
        ["empty", [""]],
        ["null", [null]],
        ["whitespace", ["   "]],
        ["all blank", ["", null, " "]],
    ])("%s draws no button and the empty note", (_n, texts) => {
        const el = section(texts);
        expect(el.querySelectorAll("button")).toHaveLength(0);
        expect(el).toHaveTextContent("Summary will appear once data is ingested.");
    });

    it("keeps the real sentence and drops the blank one", () => {
        const el = section(["", "Throughput rose 100%.", "  "]);
        const buttons = [...el.querySelectorAll("button")];
        expect(buttons.map((b) => b.textContent)).toEqual(["Throughput rose 100%."]);
        expect(el).not.toHaveTextContent("Summary will appear");
    });
});
