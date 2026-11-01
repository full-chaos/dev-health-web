import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(""),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { id: "user-1", org_id: "org-1" }, expires: "2099-01-01" },
        status: "authenticated",
    }),
}));

import { ChatEvidenceBody } from "@full-chaos/ask-dev/render";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { CTA_LABELS } from "@/lib/design/cta";
import { resetRightDrawerForTest } from "@/lib/shell/rightDrawer";
import { preloadAskDevRender } from "@/test/askDevRender";

import { AskDevPanel } from "../AskDevPanel";
import { AskDevShellProvider, useAskDevShell } from "../AskDevShellContext";
import { AskDevConversationProvider } from "../conversation/AskDevConversationContext";
import { evidenceFailureOf } from "../conversation/AskDevEvidence";
import { authorizationFailureOf, type ThreadAccess } from "../conversation/conversationStore";
import { FakeTransport } from "../conversation/__tests__/fakeTransport";
import {
    TRANSPORT_FAILURE_REASONS,
    TransportFailure,
    type TransportFailureReason,
} from "../conversation/transport";

/**
 * CHAOS-12474 (the lead's condition 4): the word Connect leaves every signed-in path. The render
 * still holds its words for a `connect` state, in a pinned package, so the guard is that web never
 * reaches them: each way a token can fail to come is rendered on each surface that shows it.
 *
 * "Connect a repository" (`no_repository`) is another subject: it asks for a repository, not for a
 * connect step, and it is not a state of this list.
 */

const THE_WORD = /\bconnect\b/iu;
const THREAD = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** Every failure that means "no token", read from the store's own map. */
const ACCESS_REASONS = TRANSPORT_FAILURE_REASONS.filter(
    (reason) => authorizationFailureOf(new TransportFailure(reason)) !== undefined,
);

function ShellProbe() {
    const { setOpen } = useAskDevShell();
    return (
        <button type="button" onClick={() => setOpen(true)}>
            test-open
        </button>
    );
}

async function openPanel(transport: FakeTransport) {
    render(
        <AdminTierProvider tier="team" features={{ ask_dev: true, agent_context_runtime: true }}>
            <AskDevShellProvider>
                <AskDevConversationProvider transport={transport}>
                    <ShellProbe />
                    <AskDevPanel />
                </AskDevConversationProvider>
            </AskDevShellProvider>
        </AdminTierProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "test-open" }));
    return within(screen.getByTestId("ask-dev-panel"));
}

function expectNoConnect() {
    expect(document.body.textContent).not.toMatch(THE_WORD);
    expect(document.querySelector('[data-testid*="connect"]')).toBeNull();
    expect(document.querySelector('a[href*="/ask-dev/oauth/"]')).toBeNull();
}

preloadAskDevRender();

beforeEach(() => {
    window.sessionStorage.clear();
});

afterEach(() => {
    resetRightDrawerForTest();
});

describe("the reasons this file covers", () => {
    it("are every way a token fails to come, and the guard sees them", () => {
        expect([...ACCESS_REASONS].sort()).toEqual(
            [
                "authorization_failed",
                "authorization_limited",
                "authorization_required",
                "impersonating",
                "not_entitled",
                "session_ended",
            ].sort(),
        );
    });
});

describe.each(ACCESS_REASONS)("%s", (reason: TransportFailureReason) => {
    it("a turn", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([{ fail: new TransportFailure(reason) }]);
        const panel = await openPanel(transport);
        await userEvent.type(
            await panel.findByRole("textbox", { name: "Ask a question" }),
            "A question{Enter}",
        );
        await panel.findByTestId("chat-status");
        expectNoConnect();
    });

    it("the history list", async () => {
        const transport = new FakeTransport();
        transport.listPages.push({ fail: new TransportFailure(reason) });
        const panel = await openPanel(transport);
        await userEvent.click(await panel.findByTestId("ask-dev-history-toggle"));
        await panel.findByTestId("ask-dev-history-read-failed");
        expectNoConnect();
    });

    it("a conversation", async () => {
        const transport = new FakeTransport();
        transport.threads.set(THREAD, { fail: new TransportFailure(reason) });
        const row = {
            threadId: THREAD,
            turnCount: 1,
            createdAt: "2026-01-02T03:04:05Z",
            lastTurnAt: "2026-01-02T03:04:05Z",
            expiresAt: "2027-01-02T03:04:05Z",
            firstQuestion: "An earlier question",
        };
        transport.listPages.push({ threads: [row], nextCursor: null });
        const panel = await openPanel(transport);
        await userEvent.click(await panel.findByTestId("ask-dev-history-toggle"));
        const [open] = await panel.findAllByTestId("ask-dev-history-open");
        await userEvent.click(open!);
        await waitFor(() => expect(transport.threadReads).toHaveLength(1));
        await waitFor(() =>
            expect(
                panel.queryByTestId("ask-dev-conversation-read-failed") ??
                    panel.queryByTestId("ask-dev-conversation-unavailable"),
            ).not.toBeNull(),
        );
        expectNoConnect();
    });

    it("evidence", () => {
        const { state, retry } = evidenceFailureOf(new TransportFailure(reason));
        render(<ChatEvidenceBody state={state} {...(retry ? { onRetry: () => undefined } : {})} />);
        expectNoConnect();
    });
});

describe("the code", () => {
    // A compile-time pin: `pnpm typecheck` fails if `connect` comes back to the store's states.
    const NO_CONNECT_STATE: Extract<ThreadAccess, { kind: "connect" }> extends never
        ? true
        : false = true;

    it("offers no label, no page and no state that says it", () => {
        expect(NO_CONNECT_STATE).toBe(true);
        const labels = Object.entries(CTA_LABELS).filter(([key]) => key.startsWith("askDev"));
        expect(labels.length).toBeGreaterThan(5);
        expect(labels.filter(([, label]) => THE_WORD.test(label))).toEqual([]);
    });

    it("has no Connect wording, link or slot in any Ask Dev source", () => {
        const files: string[] = [];
        const walk = (directory: string) => {
            for (const name of readdirSync(directory)) {
                const path = join(directory, name);
                if (statSync(path).isDirectory()) {
                    if (name !== "__tests__") walk(path);
                } else if (/\.tsx?$/u.test(name) && !/\.test\./u.test(name)) {
                    files.push(path);
                }
            }
        };
        for (const directory of [
            "src/components/ask-dev",
            "src/lib/ask-dev",
            "src/app/api/ask-dev",
        ]) {
            walk(directory);
        }
        // A walk that found nothing proves nothing.
        expect(files.length).toBeGreaterThan(30);
        const offenders = files.filter((file) =>
            /Connect Ask Dev|ConnectAskDev|slots: \{ connect|\/ask-dev\/oauth\/start/u.test(
                readFileSync(file, "utf8"),
            ),
        );
        expect(offenders).toEqual([]);
    });
});
