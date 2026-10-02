import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { fireEvent, screen } from "@/test/utils";
import { describe, expect, it } from "vitest";

import { CockpitClient } from "./CockpitClient";
import { ThreadRow } from "./ThreadRow";
import type { HomeResponse } from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";

describe("ThreadRow (CHAOS-7739)", () => {
    it("is a closed disclosure with a heading and one summary line, and keeps its content in the page", () => {
        render(
            <ThreadRow id="x" title="Limiting factor" summary="Review is slow.">
                <button type="button">Inside</button>
            </ThreadRow>,
        );
        const row = screen.getByTestId("thread-row-x") as HTMLDetailsElement;
        expect(row.tagName).toBe("DETAILS");
        expect(row.open).toBe(false);
        const summary = row.querySelector("summary") as HTMLElement;
        expect(summary).toHaveTextContent("Limiting factor");
        expect(summary).toHaveTextContent("Review is slow.");
        expect(
            screen.getByRole("heading", { level: 3, name: "Limiting factor" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Inside" })).toBeInTheDocument();
    });

    it("the summary is the keyboard control: a native summary element, not a div with a click handler", () => {
        render(
            <ThreadRow id="x" title="T" summary="S">
                body
            </ThreadRow>,
        );
        const summary = screen.getByTestId("thread-row-x").querySelector("summary") as HTMLElement;
        expect(summary.tagName).toBe("SUMMARY");
        expect(summary.getAttribute("tabindex")).toBeNull();
        expect(summary.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    });

    it("deferred content mounts only after the row is first opened, and stays mounted when closed again", () => {
        render(
            <ThreadRow id="x" title="T" summary="S" deferred={<p>Heavy chart</p>}>
                body
            </ThreadRow>,
        );
        const row = screen.getByTestId("thread-row-x") as HTMLDetailsElement;
        expect(screen.queryByText("Heavy chart")).toBeNull();
        row.open = true;
        fireEvent(row, new Event("toggle"));
        expect(screen.getByText("Heavy chart")).toBeInTheDocument();
        row.open = false;
        fireEvent(row, new Event("toggle"));
        expect(screen.getByText("Heavy chart")).toBeInTheDocument();
    });
});

describe("Investigation threads list on Home (CHAOS-7739)", () => {
    const filters = {
        scope: { level: "org", ids: ["org-1"] },
        time: { range_days: 30, compare_days: 30 },
        who: {},
        what: {},
        why: {},
        how: {},
    } as MetricFilter;
    const home = {
        freshness: { last_ingested_at: null, sources: {}, coverage: {} },
        deltas: [],
        summary: [],
        tiles: {},
        constraint: {
            title: "Review queues",
            claim: "Review queues are slow.",
            evidence: [],
            experiments: [],
        },
        events: [],
    } as unknown as HomeResponse;

    it("lists the rows in the concept order, all closed, each with its summary line from existing values", () => {
        render(<CockpitClient home={home} filters={filters} activeRole="ic" />);
        const list = screen.getByTestId("investigation-threads");
        const rows = [...list.querySelectorAll("details")] as HTMLDetailsElement[];
        expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
            "thread-row-notable-shifts",
            "thread-row-investigation-threads",
            "thread-row-limiting-factor",
            "thread-row-recent-events",
        ]);
        expect(rows.every((r) => r.open === false)).toBe(true);
        const lines = rows.map((r) => r.querySelector("summary p")?.textContent);
        expect(lines).toEqual([
            "Short shifts from the selected window.",
            "Review queues",
            "Review queues are slow.",
            "No major shifts detected in the current window.",
        ]);
    });

    it("renders extra rows from the page after the built-in ones", () => {
        render(
            <CockpitClient home={home} filters={filters} activeRole="ic">
                <ThreadRow id="investment-mix" title="Investment mix" summary="Snapshot.">
                    x
                </ThreadRow>
            </CockpitClient>,
        );
        const ids = [
            ...screen.getByTestId("investigation-threads").querySelectorAll("details"),
        ].map((r) => r.getAttribute("data-testid"));
        expect(ids.at(-1)).toBe("thread-row-investment-mix");
        expect(ids).toHaveLength(5);
    });
});
