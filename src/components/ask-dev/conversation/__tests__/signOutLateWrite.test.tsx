// @vitest-environment jsdom
// codex r2 on #1751 (CHAOS-12605): a stream event that lands while NextAuth signs out must not
// write this tab's conversation back after sign-out step 3 forgot it. The real provider, store and
// sign-out; only the network edges are fakes. A file of its own: once a sign-out forgets the tab's
// conversation, nothing in this module load writes it again.
import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    session: {
        data: { user: { id: "user-1", org_id: "org-a" }, expires: "2099-01-01" },
        status: "authenticated" as const,
    },
    signOut: vi.fn(async () => undefined),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("next-auth/react", () => ({ useSession: () => state.session, signOut: state.signOut }));
vi.mock("@/lib/logger", () => ({ logger: { ...state.log, child: () => state.log } }));

import {
    THREAD_HINT_KEY,
    UNSAVED_CONVERSATION_KEY,
    UNSAVED_THREAD_KEY,
} from "@/lib/ask-dev/conversationHint";
import { signOutEverywhere } from "@/lib/signOutEverywhere";

import { AskDevConversationProvider, useAskDevConversation } from "../AskDevConversationContext";
import { accepted, deferred, FakeTransport } from "./fakeTransport";

const probe: { current: ReturnType<typeof useAskDevConversation> } = { current: null };
function Probe() {
    const conversation = useAskDevConversation();
    useEffect(() => {
        probe.current = conversation;
    });
    return null;
}

afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
});

const held = () =>
    [THREAD_HINT_KEY, UNSAVED_CONVERSATION_KEY, UNSAVED_THREAD_KEY].filter(
        (key) => window.sessionStorage.getItem(key) !== null,
    );

it("writes neither the restore hint nor the marker back when ACR admits the run during sign-out", async () => {
    const gate = deferred();
    const transport = new FakeTransport();
    transport.scripts.push([{ wait: gate.promise }, accepted()]);
    render(
        <AskDevConversationProvider transport={transport}>
            <Probe />
        </AskDevConversationProvider>,
    );
    await waitFor(() => expect(probe.current?.snapshot.ready).toBe(true));
    act(() => {
        probe.current!.store.submit("question");
    });
    // The control: the turn wrote the marker, as a reload needs it to.
    await waitFor(() =>
        expect(window.sessionStorage.getItem(UNSAVED_CONVERSATION_KEY)).not.toBeNull(),
    );

    // NextAuth's sign-out is under way when ACR's `accepted` lands.
    state.signOut.mockImplementationOnce(async () => {
        gate.resolve();
        await waitFor(() =>
            expect(probe.current?.snapshot.turns[0]?.reservedResultId).toBe("result_reserved_0001"),
        );
        // Let the provider's effects run on that snapshot.
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    });
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status: 204 })),
    );

    await signOutEverywhere();

    expect(state.signOut).toHaveBeenCalledTimes(1);
    expect(held()).toEqual([]);
});
