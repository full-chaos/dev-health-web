import { act, useRef } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { Dialog } from "./Dialog";
import { Drawer } from "./Drawer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function DialogWithInitial() {
    const ref = useRef<HTMLInputElement>(null);
    return (
        <Dialog open onCloseAction={() => {}} title="Search" initialFocusRef={ref}>
            <input ref={ref} aria-label="query" />
        </Dialog>
    );
}

// Server render has no portal content; hydration mounts it one commit later.
function hydrate(node: React.ReactElement) {
    const container = document.createElement("div");
    container.innerHTML = renderToString(node);
    document.body.appendChild(container);
    let root!: ReturnType<typeof hydrateRoot>;
    act(() => {
        root = hydrateRoot(container, node);
    });
    return () => {
        act(() => root.unmount());
        container.remove();
    };
}

describe("a modal rendered open on first load takes initial focus", () => {
    let cleanup: (() => void) | undefined;
    afterEach(() => cleanup?.());

    it("Dialog focuses its initialFocusRef", () => {
        cleanup = hydrate(<DialogWithInitial />);
        expect(document.activeElement).toBe(document.querySelector('input[aria-label="query"]'));
    });

    it("Dialog focuses the panel when no initial ref is given", () => {
        cleanup = hydrate(
            <Dialog open onCloseAction={() => {}} title="Search">
                <p>body</p>
            </Dialog>,
        );
        expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
    });

    it("Drawer focuses Close", () => {
        cleanup = hydrate(
            <Drawer open onCloseAction={() => {}} title="Evidence">
                <p>body</p>
            </Drawer>,
        );
        expect(document.activeElement).toBe(document.querySelector('button[aria-label="Close"]'));
    });
});
