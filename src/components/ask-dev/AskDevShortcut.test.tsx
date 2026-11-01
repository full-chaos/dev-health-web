import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";

import { AskDevShellProvider, useAskDevShell } from "./AskDevShellContext";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({
    usePathname: () => nav.pathname,
    // CHAOS-11934: the shell provider holds Expand and Minimize, which move between routes.
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
// The Ask Dev availability hook reads the session (CHAOS-12306); the browser ACR client is off here.
vi.mock("next-auth/react", () => ({
    useSession: () => ({ data: null, status: "unauthenticated", update: vi.fn() }),
}));

const ON = { ask_dev: true, agent_context_runtime: true };

function State() {
    const { open } = useAskDevShell();
    return <output data-testid="state">{open ? "open" : "closed"}</output>;
}

function setup(features: Record<string, boolean> = ON) {
    return render(
        <AdminTierProvider tier="team" features={features}>
            <AskDevShellProvider>
                <input aria-label="field" />
                <textarea aria-label="area" />
                <div contentEditable suppressContentEditableWarning data-testid="editable" />
                <State />
            </AskDevShellProvider>
        </AdminTierProvider>,
    );
}

const state = () => screen.getByTestId("state").textContent;

/** Dispatches the key on `target`; returns the event, so a test can read `defaultPrevented`. */
function press(init: KeyboardEventInit, target: EventTarget = document.body): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    act(() => {
        target.dispatchEvent(event);
    });
    return event;
}

beforeEach(() => {
    nav.pathname = "/dashboard";
});

describe("Ask Dev shortcut (Cmd/Ctrl+J)", () => {
    it("toggles the panel with Ctrl+J and with Cmd+J, and suppresses the browser default", () => {
        setup();
        expect(state()).toBe("closed");
        expect(press({ key: "j", ctrlKey: true }).defaultPrevented).toBe(true);
        expect(state()).toBe("open");
        expect(press({ key: "J", metaKey: true }).defaultPrevented).toBe(true);
        expect(state()).toBe("closed");
    });

    it("does nothing in an input, a textarea or an editable region, and leaves the default alone", () => {
        setup();
        for (const target of [
            screen.getByLabelText("field"),
            screen.getByLabelText("area"),
            screen.getByTestId("editable"),
        ]) {
            const event = press({ key: "j", ctrlKey: true }, target);
            expect(event.defaultPrevented).toBe(false);
            expect(state()).toBe("closed");
        }
    });

    it("ignores J without Cmd/Ctrl, and Alt or Shift combinations", () => {
        setup();
        expect(press({ key: "j" }).defaultPrevented).toBe(false);
        expect(press({ key: "j", ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
        expect(press({ key: "j", ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
        expect(state()).toBe("closed");
    });

    it("does nothing while another modal dialog is open", () => {
        setup();
        const modal = document.createElement("div");
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        document.body.append(modal);
        const event = press({ key: "j", ctrlKey: true });
        modal.remove();
        expect(event.defaultPrevented).toBe(false);
        expect(state()).toBe("closed");
    });

    it("follows the launcher gate: no entitlement or an excluded route means no shortcut", () => {
        const { unmount } = setup({ ask_dev: true });
        expect(press({ key: "j", ctrlKey: true }).defaultPrevented).toBe(false);
        expect(state()).toBe("closed");
        unmount();

        nav.pathname = "/agent-context";
        setup();
        expect(press({ key: "j", ctrlKey: true }).defaultPrevented).toBe(false);
        expect(state()).toBe("closed");
    });
});
