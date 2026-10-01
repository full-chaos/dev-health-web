import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";

import ExperimentsPage from "./page";

// Experiments inside the shared app shell. The Improve crumb in the top bar
// replaces the in-page link back to the Improve overview.

const scopeBarSpy = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    usePathname: () => "/improve/experiments",
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
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/graphql/improveFetchers", () => ({
    getExperimentsViaGraphQL: vi.fn().mockResolvedValue({ items: [] }),
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
                {await ExperimentsPage({ searchParams: Promise.resolve({ role: "em" }) })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Experiments in the shared app shell", () => {
    it("has one main, one h1 and the subtitle", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Experiments");
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent(
            "Improve / Experiments",
        );
        expect(
            within(screen.getByTestId("page-header")).getByText(
                "Process experiments derived from improvement opportunities — each with a hypothesis, owner, metric, and stop condition.",
            ),
        ).toBeInTheDocument();
    });

    it("has no in-page back link: the Improve crumb is the return path", async () => {
        await renderPage();

        expect(
            within(screen.getByRole("main")).queryByRole("link", { name: /Back to/ }),
        ).toBeNull();
        const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole(
            "link",
            { name: "Improve" },
        );
        const url = new URL(crumb.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/improve");
        expect(url.searchParams.get("role")).toBe("em");
    });

    it("renders one scope bar with no page filters, above the content: the page had the global context bar alone", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({ pageFilters: false });
        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(
            screen
                .getByTestId("scope-bar")
                .compareDocumentPosition(screen.getByTestId("experiments-empty")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });
});
