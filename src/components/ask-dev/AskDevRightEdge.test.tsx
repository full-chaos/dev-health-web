import { StrictMode, useLayoutEffect, useRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import {
    claimRightDrawer,
    resetRightDrawerForTest,
    rightDrawerOwnerForTest,
} from "@/lib/shell/rightDrawer";

import { AskDevShellProvider, useAskDevShell } from "./AskDevShellContext";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({
    usePathname: () => nav.pathname,
    // CHAOS-11934: the shell provider holds Expand and Minimize, which move between routes.
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const ON = { ask_dev: true, agent_context_runtime: true };

/**
 * CHAOS-12207: web e2e `ask-dev-panel.spec.ts:73` failed on CI under `next dev`: the filter drawer
 * opened and the Ask Dev panel stayed open. In each failing trace the launcher click ran before
 * the shell's mount effects had run (the session and organization reads they start came after
 * it): the click landed while the shell was still hydrating.
 *
 * An open request that lands before the provider's passive mount effects is modelled here by a
 * layout effect, which runs in the same commit before them, and only once, as a click does (a ref
 * keeps StrictMode's second setup from opening again). Under StrictMode (as `next dev` renders),
 * React then runs every mount effect's cleanup and setup once more: the provider's unmount cleanup
 * released "ask-dev" while the panel stayed open, so the next right drawer found no owner to close.
 */
function OpenBeforeMountEffects() {
    const { setOpen } = useAskDevShell();
    const clicked = useRef(false);
    useLayoutEffect(() => {
        if (clicked.current) return;
        clicked.current = true;
        setOpen(true);
    }, [setOpen]);
    return null;
}

function State() {
    const { open } = useAskDevShell();
    return <output data-testid="state">{open ? "open" : "closed"}</output>;
}

function renderShell({ strict }: { strict: boolean }) {
    const tree = (
        <AdminTierProvider tier="team" features={ON}>
            <AskDevShellProvider>
                <OpenBeforeMountEffects />
                <State />
            </AskDevShellProvider>
        </AdminTierProvider>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const state = () => screen.getByTestId("state").textContent;

beforeEach(() => {
    nav.pathname = "/dashboard";
    resetRightDrawerForTest();
});

describe("the Ask Dev panel holds the right edge while it is open (CHAOS-12207)", () => {
    it.each([
        ["StrictMode, as next dev renders", true],
        ["without StrictMode, as a production build renders", false],
    ])("%s: an open before the mount effects keeps the edge", (_name, strict) => {
        renderShell({ strict });
        expect(state()).toBe("open");
        expect(rightDrawerOwnerForTest()).toBe("ask-dev");
    });

    it.each([
        ["StrictMode", true],
        ["no StrictMode", false],
    ])("%s: another right drawer opening closes the panel", (_name, strict) => {
        renderShell({ strict });
        act(() => claimRightDrawer("filters", () => undefined));
        expect(state()).toBe("closed");
        expect(rightDrawerOwnerForTest()).toBe("filters");
    });
});

describe("the claim ends with the panel", () => {
    function CloseButton() {
        const { close } = useAskDevShell();
        return (
            <button type="button" onClick={close}>
                test-close
            </button>
        );
    }

    function renderOpen() {
        return render(
            <StrictMode>
                <AdminTierProvider tier="team" features={ON}>
                    <AskDevShellProvider>
                        <OpenBeforeMountEffects />
                        <CloseButton />
                        <State />
                    </AskDevShellProvider>
                </AdminTierProvider>
            </StrictMode>,
        );
    }

    it("closing the panel gives the edge back", () => {
        renderOpen();
        expect(rightDrawerOwnerForTest()).toBe("ask-dev");
        act(() => screen.getByRole("button", { name: "test-close" }).click());
        expect(state()).toBe("closed");
        expect(rightDrawerOwnerForTest()).toBeNull();
    });

    it("leaving the shell gives the edge back", () => {
        const { unmount } = renderOpen();
        unmount();
        expect(rightDrawerOwnerForTest()).toBeNull();
    });

    it("an excluded route closes the panel and gives the edge back", () => {
        const view = renderOpen();
        nav.pathname = "/agent-context/context-packet";
        view.rerender(
            <StrictMode>
                <AdminTierProvider tier="team" features={ON}>
                    <AskDevShellProvider>
                        <OpenBeforeMountEffects />
                        <CloseButton />
                        <State />
                    </AskDevShellProvider>
                </AdminTierProvider>
            </StrictMode>,
        );
        expect(state()).toBe("closed");
        expect(rightDrawerOwnerForTest()).toBeNull();
    });

    it("a peer's later claim is not undone by the panel closing", () => {
        renderOpen();
        act(() => claimRightDrawer("filters", () => undefined));
        expect(state()).toBe("closed");
        expect(rightDrawerOwnerForTest()).toBe("filters");
    });
});
