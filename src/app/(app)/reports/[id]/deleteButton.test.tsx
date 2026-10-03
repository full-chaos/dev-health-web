import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@/test/utils";

import SingleReportPage from "./page";
import type { SavedReport } from "@/lib/reports/types";

// CHAOS-8096 review: the filled Delete label was dark ink on red (2.35:1) because the secondary
// Button variant's `text-foreground` beat the label token. Pins the winning classes and the
// contrast of the token pair in both themes.

vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-session-1" }));
vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "report-1" }),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/reports/report-1",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/reports/fetchers", () => ({
    fetchSavedReport: vi.fn(),
    fetchReportRuns: vi.fn(),
    triggerReport: vi.fn(),
    updateSavedReport: vi.fn(),
    cloneSavedReport: vi.fn(),
    deleteSavedReport: vi.fn(),
}));
import { fetchReportRuns, fetchSavedReport } from "@/lib/reports/fetchers";

const REPORT: SavedReport = {
    id: "report-1",
    orgId: "o",
    name: "Weekly DORA",
    reportPlan: {},
    isTemplate: false,
    isActive: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
};

const themes = readFileSync(join(process.cwd(), "src/app/fc-infinity-themes.css"), "utf8");
const tokens = (theme: "light" | "dark") => {
    const sel = `:root[data-palette="infinity"][data-theme="${theme}"] {`;
    const start = themes.indexOf(sel);
    const body = themes.slice(start + sel.length, themes.indexOf("\n}", start));
    return Object.fromEntries(
        [...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6});/gu)].map((m) => [m[1], m[2]]),
    );
};
const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (h: string) =>
    [1, 3, 5]
        .map((i) => lin(parseInt(h.slice(i, i + 2), 16)))
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

beforeEach(() => {
    vi.mocked(fetchSavedReport).mockResolvedValue(REPORT);
    vi.mocked(fetchReportRuns).mockResolvedValue({ items: [], total: 0 });
});

describe("Delete confirm button (CHAOS-8096)", () => {
    it("takes the label token and the negative fill with the important suffix", async () => {
        render(<SingleReportPage />);
        await screen.findByRole("heading", { level: 1, name: "Weekly DORA" });
        await act(async () => {
            screen.getByRole("button", { name: "Delete" }).click();
        });
        const confirm = within(screen.getByTestId("delete-panel")).getByRole("button", {
            name: "Delete",
        });

        expect(confirm).toHaveClass("text-(--accent-foreground)!");
        expect(confirm).toHaveClass("bg-(--negative)!");
    });

    it("keeps the label token on the negative fill at 4.5:1 or more in both themes", () => {
        for (const theme of ["light", "dark"] as const) {
            const t = tokens(theme);
            expect(ratio(t["--accent-foreground"], t["--negative"]), theme).toBeGreaterThanOrEqual(
                4.5,
            );
        }
    });
});
