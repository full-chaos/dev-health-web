import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";

import DiagnosePage from "./page";

// The Diagnose overview inside the shared app shell: the layout owns the
// navigation and `<main>`; the page brings the shared header and one scope bar.

const scopeBarSpy = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    usePathname: () => "/diagnose",
    useSearchParams: () => new URLSearchParams("role=em"),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({
    ScopeBar: (props: Record<string, unknown>) => {
        scopeBarSpy(props);
        return <section data-testid="scope-bar" />;
    },
}));
vi.mock("@/components/navigation/AreaOverview", () => ({
    AreaOverview: () => <div data-testid="area-overview" />,
}));
vi.mock("@/lib/areaSignals/diagnose", () => ({
    getDiagnoseSignals: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "true" }),
}));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                {await DiagnosePage({
                    searchParams: Promise.resolve({ role: "em", origin: "cockpit" }),
                })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Diagnose overview in the shared app shell", () => {
    it("has one main, one h1 and one sidebar", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Diagnose");
        expect(document.querySelectorAll("aside")).toHaveLength(1);
        expect(screen.getAllByRole("navigation", { name: "Primary areas" })).toHaveLength(1);
    });

    it("keeps the header text, with the eyebrow from the navigation trail", async () => {
        await renderPage();

        const header = within(screen.getByTestId("page-header"));
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("Diagnose / Overview");
        expect(
            header.getByText(
                "Investigate flow, investment, landscape, work graph, complexity, cognitive load, bottlenecks, and code from one durable area.",
            ),
        ).toBeInTheDocument();
    });

    it("has no in-page 'Back to Home': the sidebar Home entry is the return path, with the state", async () => {
        await renderPage();

        expect(
            within(screen.getByRole("main")).queryByRole("link", { name: /Back to/ }),
        ).toBeNull();
        const cockpit = screen.getByRole("link", { name: /^Home$/ });
        const url = new URL(cockpit.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/dashboard");
        expect(url.searchParams.has("f")).toBe(true);
        expect(url.searchParams.get("role")).toBe("em");
    });

    it("renders one scope bar for the work view, with the origin, above the content", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({ view: "work", origin: "cockpit" });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        const bar = screen.getByTestId("scope-bar");
        const content = screen.getByTestId("area-overview");
        expect(
            bar.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });
});
