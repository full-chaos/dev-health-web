import { act, render, screen } from "@testing-library/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CHAOS-12450: the render as a chunk that arrives late, or never. `gate` holds the import open, so
 * each state between the first open and the render can be read.
 */
const load = vi.hoisted(() => {
    const state = {
        release: () => undefined as void,
        gate: Promise.resolve(),
        fail: false,
    };
    return state;
});
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock("@/lib/logger", () => ({ logger: log }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("./useAskDevAvailability", () => ({ useAskDevAvailability: () => "on" }));
vi.mock("./AskDevShellContext", () => ({
    useAskDevShell: () => ({ open: true, close: vi.fn(), expand: vi.fn() }),
}));
/** As the real one does: its composer takes focus on mount, and then it reports. */
function StubRender({ onMounted }: { onMounted?: (focusBefore: Element | null) => void }) {
    const composer = useRef<HTMLTextAreaElement>(null);
    const before = useRef<Element | null>(null);
    useLayoutEffect(() => {
        before.current = document.activeElement;
    }, []);
    useEffect(() => {
        composer.current?.focus();
        onMounted?.(before.current);
    }, [onMounted]);
    return <textarea aria-label="composer" ref={composer} />;
}

/** `matches` answers the `md` query: false is the sheet. */
function setDesktop(desktop: boolean) {
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({
            matches: desktop,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    );
}

async function openPanel() {
    const { AskDevPanel } = await import("./AskDevPanel");
    render(<AskDevPanel />);
}

const arrive = () =>
    act(async () => {
        load.release();
        await vi.dynamicImportSettled();
    });

beforeEach(() => {
    vi.resetModules();
    log.warn.mockClear();
    load.fail = false;
    load.gate = new Promise((resolve) => {
        load.release = resolve;
    });
    vi.doMock("./AskDevRender", async () => {
        await load.gate;
        if (load.fail) throw new Error("chunk did not load");
        return { AskDevRender: StubRender };
    });
    setDesktop(true);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("the panel while the render loads", () => {
    it("says it is loading, in a focused panel, then shows the render", async () => {
        await openPanel();
        expect(screen.getByTestId("ask-dev-render-loading")).toHaveTextContent("Loading Ask Dev…");
        expect(screen.getByTestId("ask-dev-panel")).toHaveFocus();

        await arrive();

        expect(await screen.findByRole("textbox", { name: "composer" })).toBeInTheDocument();
        expect(screen.queryByTestId("ask-dev-render-loading")).toBeNull();
        expect(screen.getByTestId("ask-dev-panel")).toHaveFocus();
    });

    it("leaves focus alone if the viewer moved it out of the panel meanwhile", async () => {
        const outside = document.createElement("button");
        document.body.append(outside);
        await openPanel();
        outside.focus();

        await arrive();
        await screen.findByRole("textbox", { name: "composer" });

        expect(outside).toHaveFocus();
        outside.remove();
    });

    it("leaves focus on the sheet's Close when the render arrives there too", async () => {
        setDesktop(false);
        await openPanel();
        const close = screen.getByTestId("drawer-close");
        expect(close).toHaveFocus();

        await arrive();
        await screen.findByRole("textbox", { name: "composer" });

        expect(close).toHaveFocus();
    });

    it("says so when the chunk does not load, logs it, and keeps the page", async () => {
        load.fail = true;
        await openPanel();

        await arrive();

        expect(await screen.findByTestId("ask-dev-render-failed")).toHaveTextContent(
            "Ask Dev could not load. Reload the page to try again.",
        );
        expect(screen.getByTestId("ask-dev-panel")).toBeInTheDocument();
        expect(log.warn).toHaveBeenCalledOnce();
    });
});
