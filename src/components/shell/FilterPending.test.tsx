import { act, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { useFilterBarState } from "@/components/filters/useFilterBarState";

import { AppShell } from "./AppShell";
import { useReportFilterPending } from "./FilterPending";

const nav = vi.hoisted(() => ({
    replace: vi.fn(),
    pendingNow: false,
    startTransition: undefined as undefined | ((cb: () => void) => void),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/metrics",
    useSearchParams: () => new URLSearchParams(""),
    useRouter: () => ({ refresh: vi.fn(), replace: nav.replace, push: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));

vi.mock("@/components/filters/useFilterOptions", () => ({
    useFilterOptions: () => ({ teams: [], repos: [], developers: [], services: [] }),
}));

// The transition state is the one thing a unit test cannot hold open with a sync router mock:
// the test sets it.
vi.mock("react", async (importOriginal) => {
    const actual = await importOriginal<typeof import("react")>();
    return {
        ...actual,
        useTransition: () =>
            [
                nav.pendingNow,
                (cb: () => void) => (nav.startTransition ?? ((f) => f()))(cb),
            ] as const,
    };
});

function Reporter({ pending }: { pending: boolean }) {
    useReportFilterPending(pending);
    return <h1>Page</h1>;
}

function renderShell(pending: boolean) {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                <Reporter pending={pending} />
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    nav.replace.mockReset();
    nav.pendingNow = false;
    nav.startTransition = undefined;
});

describe("window change busy state (CHAOS-8184)", () => {
    it("marks the content busy, with a status line and a bar, while a filter change is pending", () => {
        renderShell(true);
        const main = document.getElementById("main-content") as HTMLElement;
        expect(main).toHaveAttribute("aria-busy", "true");
        expect(main).toHaveAttribute("data-filter-pending", "true");
        expect(screen.getByTestId("filter-pending-bar")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Loading the new window");
        // The page content is still there: nothing is replaced by a made value.
        expect(screen.getByRole("heading", { name: "Page" })).toBeInTheDocument();
    });

    it("shows no busy mark when nothing is pending", () => {
        renderShell(false);
        const main = document.getElementById("main-content") as HTMLElement;
        expect(main).not.toHaveAttribute("aria-busy");
        expect(main).not.toHaveAttribute("data-filter-pending");
        expect(screen.queryByTestId("filter-pending-bar")).not.toBeInTheDocument();
    });

    it("clears the busy mark when the pending state ends", () => {
        const { rerender } = renderShell(true);
        expect(document.getElementById("main-content")).toHaveAttribute("aria-busy", "true");
        rerender(
            <AdminTierProvider tier="community" features={{}}>
                <AppShell>
                    <Reporter pending={false} />
                </AppShell>
            </AdminTierProvider>,
        );
        expect(document.getElementById("main-content")).not.toHaveAttribute("aria-busy");
    });

    it("the filter writer reports its transition state and writes the URL inside the transition", () => {
        const writes: boolean[] = [];
        let inside = false;
        nav.replace.mockImplementation(() => writes.push(inside));
        nav.startTransition = (cb) => {
            inside = true;
            cb();
            inside = false;
        };
        nav.pendingNow = true;
        const { result } = renderHook(() =>
            useFilterBarState({ view: "metrics", tab: undefined, writeDefaultFilter: false }),
        );
        expect(result.current.isPending).toBe(true);
        writes.length = 0;
        act(() => result.current.handleDatePreset(90));
        expect(writes).toEqual([true]);
    });
});
