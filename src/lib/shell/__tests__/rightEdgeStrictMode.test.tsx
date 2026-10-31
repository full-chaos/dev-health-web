import { StrictMode, useLayoutEffect, useRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FILTER_OPTIONS, scopeBarUrl } from "@/test/scopeBarHarness";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: scopeBarUrl.replace, push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => scopeBarUrl.pathname,
    useSearchParams: () => new URLSearchParams(scopeBarUrl.search),
}));
vi.mock("@/components/filters/useFilterOptions", () => ({
    useFilterOptions: () => FILTER_OPTIONS,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/lib/api/home", () => ({ getExplainData: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
    EvidenceDrawerProvider,
    useEvidenceDrawer,
} from "@/components/evidence/EvidenceDrawerProvider";
import { ScopeBar } from "@/components/shell/ScopeBar";

import { claimRightDrawer, resetRightDrawerForTest, rightDrawerOwnerForTest } from "../rightDrawer";

/**
 * CHAOS-12211, the same class as CHAOS-12207 (#1641): an owner that claims the right edge
 * imperatively when it opens, and releases it in an unmount-only effect cleanup. Under StrictMode
 * (`next dev`) React runs every mount effect's cleanup and setup once more after mount; an open that
 * lands before the owner's passive mount effects (a click while the page still hydrates) then loses
 * its claim with the drawer still open, and the next right drawer finds no owner to close.
 *
 * Each drawer here is opened once, from a layout effect, which runs in the same commit before the
 * passive mount effects (a ref keeps StrictMode's second setup from opening it again).
 */
function useOnceBeforeMountEffects(action: () => void) {
    const done = useRef(false);
    useLayoutEffect(() => {
        if (done.current) return;
        done.current = true;
        action();
    });
}

const strict = (node: React.ReactNode, on: boolean) =>
    on ? <StrictMode>{node}</StrictMode> : node;

beforeEach(() => {
    resetRightDrawerForTest();
    scopeBarUrl.reset("");
    window.history.replaceState({}, "", "/dashboard");
});

describe("the evidence drawer holds the right edge while it is open", () => {
    function OpenEvidence() {
        const evidence = useEvidenceDrawer();
        useOnceBeforeMountEffects(() =>
            evidence.open({ title: "Cycle Time", content: <p>Evidence body</p> }),
        );
        return null;
    }

    function renderEvidence(on: boolean) {
        return render(
            strict(
                <EvidenceDrawerProvider>
                    <OpenEvidence />
                </EvidenceDrawerProvider>,
                on,
            ),
        );
    }

    it.each([
        ["StrictMode, as next dev renders", true],
        ["without StrictMode, as a production build renders", false],
    ])("%s: an open before the mount effects keeps the edge", (_name, on) => {
        renderEvidence(on);
        expect(screen.getByText("Evidence body")).toBeInTheDocument();
        expect(rightDrawerOwnerForTest()).toBe("evidence");
    });

    it.each([
        ["StrictMode", true],
        ["no StrictMode", false],
    ])("%s: another right drawer opening closes it", (_name, on) => {
        renderEvidence(on);
        act(() => claimRightDrawer("filters", () => undefined));
        expect(screen.queryByText("Evidence body")).toBeNull();
        expect(rightDrawerOwnerForTest()).toBe("filters");
    });
});

describe("the filter drawer holds the right edge while it is open", () => {
    function OpenFilters() {
        useOnceBeforeMountEffects(() => {
            // The scope bar's own Filters button, as a click on it would.
            document.querySelector<HTMLButtonElement>('button[aria-label="Filters"]')?.click();
        });
        return null;
    }

    function renderFilters(on: boolean) {
        return render(
            strict(
                <>
                    <ScopeBar view="home" orgName="Test" />
                    <OpenFilters />
                </>,
                on,
            ),
        );
    }

    it.each([
        ["StrictMode, as next dev renders", true],
        ["without StrictMode, as a production build renders", false],
    ])("%s: an open before the mount effects keeps the edge", (_name, on) => {
        renderFilters(on);
        expect(screen.getByTestId("filter-drawer")).toBeInTheDocument();
        expect(rightDrawerOwnerForTest()).toBe("filters");
    });

    it.each([
        ["StrictMode", true],
        ["no StrictMode", false],
    ])("%s: another right drawer opening closes it", (_name, on) => {
        renderFilters(on);
        act(() => claimRightDrawer("ask-dev", () => undefined));
        expect(screen.queryByTestId("filter-drawer")).toBeNull();
        expect(rightDrawerOwnerForTest()).toBe("ask-dev");
    });
});

describe("each claim ends with its drawer", () => {
    function EvidenceWithClose() {
        const evidence = useEvidenceDrawer();
        useOnceBeforeMountEffects(() =>
            evidence.open({ title: "Cycle Time", content: <p>Evidence body</p> }),
        );
        return (
            <button type="button" onClick={evidence.close}>
                test-close-evidence
            </button>
        );
    }

    const evidenceTree = () => (
        <StrictMode>
            <EvidenceDrawerProvider>
                <EvidenceWithClose />
            </EvidenceDrawerProvider>
        </StrictMode>
    );

    it("closing the evidence drawer gives the edge back", () => {
        render(evidenceTree());
        expect(rightDrawerOwnerForTest()).toBe("evidence");
        act(() => screen.getByRole("button", { name: "test-close-evidence" }).click());
        expect(screen.queryByText("Evidence body")).toBeNull();
        expect(rightDrawerOwnerForTest()).toBeNull();
    });

    it("a navigation that drops the evidence subject gives the edge back", () => {
        const view = render(evidenceTree());
        expect(rightDrawerOwnerForTest()).toBe("evidence");
        scopeBarUrl.pathname = "/metrics";
        view.rerender(evidenceTree());
        expect(screen.queryByText("Evidence body")).toBeNull();
        expect(rightDrawerOwnerForTest()).toBeNull();
    });

    it("leaving the shell gives the evidence drawer's edge back", () => {
        const view = render(evidenceTree());
        view.unmount();
        expect(rightDrawerOwnerForTest()).toBeNull();
    });

    function OpenFiltersOnce() {
        useOnceBeforeMountEffects(() => {
            document.querySelector<HTMLButtonElement>('button[aria-label="Filters"]')?.click();
        });
        return null;
    }

    const filtersTree = () => (
        <StrictMode>
            <ScopeBar view="home" orgName="Test" />
            <OpenFiltersOnce />
        </StrictMode>
    );

    it("closing the filter drawer gives the edge back", () => {
        render(filtersTree());
        expect(rightDrawerOwnerForTest()).toBe("filters");
        act(() => {
            screen
                .getByTestId("filter-drawer")
                .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        });
        expect(screen.queryByTestId("filter-drawer")).toBeNull();
        expect(rightDrawerOwnerForTest()).toBeNull();
    });

    it("the inline filters below md take no claim", () => {
        vi.stubGlobal(
            "matchMedia",
            vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        );
        try {
            render(filtersTree());
            expect(document.querySelector("#scope-bar-filters")).not.toBeNull();
            expect(rightDrawerOwnerForTest()).toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
