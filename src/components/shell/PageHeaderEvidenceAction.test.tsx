import { screen, userEvent, waitFor, within } from "@/test/utils";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";

import { PageHeader } from "./PageHeader";
import { PageHeaderEvidenceAction } from "./PageHeaderEvidenceAction";

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
}));

const filters = {
    scope: { level: "org", ids: [] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const REF = "/api/home/evidence/page";

const header = () => (
    <PageHeader
        title="Home"
        actions={<PageHeaderEvidenceAction subject={{ title: "Home", apiUrl: REF, filters }} />}
    />
);

const stubEvidence = () =>
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    label: "Home",
                    summary: "Review latency appears higher in this window.",
                    evidence: [],
                    actions: [],
                    provenance: { source: "home API", quality: "high" },
                }),
        }),
    );

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("PageHeaderEvidenceAction", () => {
    it("is a button named 'View evidence' in the page header actions, with a decorative icon", () => {
        render(header());

        const action = within(screen.getByTestId("page-header-actions")).getByRole("button", {
            name: "View evidence",
        });
        expect(action).toHaveAttribute("type", "button");
        const icon = action.querySelector("svg");
        expect(icon).not.toBeNull();
        expect(icon).toHaveAttribute("aria-hidden", "true");
    });

    it("has the approved ghost look: action colour, no border, sentence case", () => {
        render(header());

        const action = screen.getByRole("button", { name: "View evidence" });
        expect(action).toHaveTextContent(/^View evidence$/);
        const classes = action.className.split(/\s+/);
        expect(classes).toContain("text-(--accent-2)");
        expect(classes).toContain("border-transparent");
        expect(classes).toContain("bg-transparent");
        expect(classes).not.toContain("uppercase");
    });

    it("opens the shared drawer for the page subject", async () => {
        stubEvidence();
        render(header());
        expect(screen.queryByRole("dialog")).toBeNull();

        await userEvent.click(screen.getByRole("button", { name: "View evidence" }));

        const drawer = screen.getByRole("dialog", { name: "Evidence & Context" });
        expect(within(drawer).getByTestId("evidence-subject")).toHaveTextContent("Home");
        // The page's evidence reference drives the request.
        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(REF));
        await waitFor(() =>
            expect(within(drawer).getByTestId("evidence-facts")).toHaveTextContent("home API"),
        );
    });

    it("has no 'Source capture' action (decision D1)", () => {
        render(header());

        expect(screen.queryByText(/Source capture/i)).toBeNull();
        expect(
            within(screen.getByTestId("page-header-actions")).getAllByRole("button"),
        ).toHaveLength(1);
    });
});
