import { render, screen } from "@testing-library/react";
import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(""),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const auth = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("next-auth/react", () => ({ useSession: () => auth.session }));

/**
 * The shell, held open: the shell's own gate closes the panel before the panel's gate is reached,
 * so the panel's gate is pinned here on its own (CHAOS-12306).
 */
vi.mock("../AskDevShellContext", () => ({
    useAskDevShell: () => ({
        open: true,
        setOpen: vi.fn(),
        close: vi.fn(),
        expand: vi.fn(),
        minimize: vi.fn(),
    }),
}));

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { acrBrowserClientOff, acrBrowserClientOn } from "@/test/acrBrowserClient";

import { AskDevPanel } from "../AskDevPanel";

const ON = { ask_dev: true, agent_context_runtime: true };
const IMPERSONATING = {
    data: {
        user: { id: "admin-1", org_id: "org-1", is_impersonating: true },
        expires: "2099-01-01",
    } as Session,
    status: "authenticated",
};

function renderPanel() {
    return render(
        <AdminTierProvider tier="team" features={ON}>
            <AskDevPanel />
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    auth.session = IMPERSONATING;
});

afterEach(() => {
    acrBrowserClientOff();
});

describe("the panel's own gate (CHAOS-12306)", () => {
    it("draws nothing while impersonating with the browser ACR client on, even when open", () => {
        acrBrowserClientOn();
        renderPanel();
        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();
    });

    it("draws the panel while the first session read is pending, with the client on (codex r2 on #1680)", () => {
        acrBrowserClientOn();
        auth.session = { data: null, status: "loading" };
        renderPanel();
        expect(screen.getByTestId("ask-dev-panel")).toBeInTheDocument();
    });

    it("draws the panel while impersonating with the client off, as before", () => {
        renderPanel();
        expect(screen.getByTestId("ask-dev-panel")).toBeInTheDocument();
    });
});
