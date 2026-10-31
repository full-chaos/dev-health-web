import { useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

type SessionState = {
    data: Session | null;
    status: "authenticated" | "unauthenticated" | "loading";
};
const sessionState = vi.hoisted(() => ({ current: null as unknown as SessionState }));
vi.mock("next-auth/react", () => ({ useSession: () => sessionState.current }));

import {
    AskDevConversationProvider,
    partitionKey,
    partitionTag,
    UNSAVED_CONVERSATION_KEY,
    useAskDevConversation,
    useAskDevNotSaved,
} from "../AskDevConversationContext";
import { deferred, FakeTransport, resultEvent, captureResult, accepted } from "./fakeTransport";

const PARTIAL = captureResult("kiac_project_status_partial.event.json");

function signedIn(user: Partial<Session["user"]>): SessionState {
    return {
        data: {
            user: { id: "user-1", org_id: "org-a", ...user },
            expires: "2099-01-01",
        } as Session,
        status: "authenticated",
    };
}

const probe: { current: ReturnType<typeof useAskDevConversation> } = { current: null };
function Probe() {
    const conversation = useAskDevConversation();
    useEffect(() => {
        probe.current = conversation;
    });
    return <p data-testid="turns">{conversation?.snapshot.turns.length ?? "none"}</p>;
}

beforeEach(() => {
    probe.current = null;
    sessionState.current = signedIn({});
});

describe("partitionKey", () => {
    it("is the effective org, the user and the impersonated user", () => {
        const a = partitionKey(signedIn({}).data, "authenticated");
        expect(a).toBe("org-a\u0000user-1\u0000");
        expect(partitionKey(signedIn({ org_id: "org-b" }).data, "authenticated")).not.toBe(a);
        expect(
            partitionKey(
                signedIn({ is_impersonating: true, impersonated_user_id: "user-9" }).data,
                "authenticated",
            ),
        ).toBe("org-a\u0000user-1\u0000user-9");
    });

    it("is null when signed out, and undefined (no change) while the session loads", () => {
        expect(partitionKey(null, "unauthenticated")).toBeNull();
        expect(partitionKey(signedIn({ org_id: undefined }).data, "authenticated")).toBeNull();
        expect(partitionKey(signedIn({}).data, "loading")).toBeUndefined();
    });
});

describe("AskDevConversationProvider", () => {
    it("has no store, and so no conversation, without a transport", () => {
        render(
            <AskDevConversationProvider transport={null}>
                <Probe />
            </AskDevConversationProvider>,
        );
        expect(screen.getByTestId("turns")).toHaveTextContent("none");
    });

    it("clears the conversation and aborts its run on an org switch, but not on a session refetch", async () => {
        const transport = new FakeTransport();
        const gate = deferred();
        transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(PARTIAL)]);
        const view = render(
            <AskDevConversationProvider transport={transport}>
                <Probe />
            </AskDevConversationProvider>,
        );
        await waitFor(() => expect(probe.current?.snapshot.ready).toBe(true));
        act(() => {
            probe.current!.store.submit("Which projects are at risk?");
        });
        expect(screen.getByTestId("turns")).toHaveTextContent("1");

        sessionState.current = { ...signedIn({}), status: "loading" };
        view.rerender(
            <AskDevConversationProvider transport={transport}>
                <Probe />
            </AskDevConversationProvider>,
        );
        expect(screen.getByTestId("turns")).toHaveTextContent("1");
        expect(transport.calls[0]!.signal.aborted).toBe(false);

        sessionState.current = signedIn({ org_id: "org-b" });
        view.rerender(
            <AskDevConversationProvider transport={transport}>
                <Probe />
            </AskDevConversationProvider>,
        );
        await waitFor(() => expect(screen.getByTestId("turns")).toHaveTextContent("0"));
        expect(transport.calls[0]!.signal.aborted).toBe(true);
        gate.resolve();
    });

    // codex r1 on #1632: the server has no store (no run starts there), and hydration must render
    // exactly what the server rendered; the store appears right after.
    it("hydrates without a mismatch", async () => {
        const transport = new FakeTransport();
        const tree = (
            <AskDevConversationProvider transport={transport}>
                <Probe />
            </AskDevConversationProvider>
        );
        vi.stubGlobal("window", undefined);
        let html: string;
        try {
            html = renderToString(tree);
        } finally {
            vi.unstubAllGlobals();
        }
        expect(html).toContain("none");
        const container = document.createElement("div");
        container.innerHTML = html;
        document.body.appendChild(container);
        const errors: unknown[] = [];
        await act(async () => {
            hydrateRoot(container, tree, { onRecoverableError: (error) => errors.push(error) });
        });
        expect(errors).toEqual([]);
        await waitFor(() => expect(container.textContent).toBe("0"));
        container.remove();
    });

    it("ends the run when the shell unmounts", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), { wait: deferred().promise }]);
        const view = render(
            <AskDevConversationProvider transport={transport}>
                <Probe />
            </AskDevConversationProvider>,
        );
        await waitFor(() => expect(probe.current?.snapshot.ready).toBe(true));
        act(() => {
            probe.current!.store.submit("Which projects are at risk?");
        });
        view.unmount();
        expect(transport.calls[0]!.signal.aborted).toBe(true);
    });
});

// CHAOS-11934, codex r1 on #1642: the reload marker names the (org, principal) whose conversation it
// was. On an org switch the render already has the new partition while the store still holds the
// old one's turns; the marker must stay org A's, so org B is never told it lost a conversation.
describe("the reload marker follows the conversation's own (org, principal)", () => {
    function NotSaved() {
        return <output data-testid="not-saved">{String(useAskDevNotSaved())}</output>;
    }

    beforeEach(() => window.sessionStorage.clear());

    it("keeps org A's tag across a switch to org B", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        const view = render(
            <AskDevConversationProvider transport={transport}>
                <Probe />
            </AskDevConversationProvider>,
        );
        await waitFor(() => expect(probe.current?.snapshot.ready).toBe(true));
        act(() => {
            probe.current!.store.submit("Which projects are at risk?");
        });
        await waitFor(() => expect(screen.getByTestId("turns")).toHaveTextContent("1"));
        const tagA = partitionTag("org-a\u0000user-1\u0000");
        expect(window.sessionStorage.getItem(UNSAVED_CONVERSATION_KEY)).toBe(tagA);

        sessionState.current = signedIn({ org_id: "org-b" });
        view.rerender(
            <AskDevConversationProvider transport={transport}>
                <Probe />
            </AskDevConversationProvider>,
        );
        await waitFor(() => expect(screen.getByTestId("turns")).toHaveTextContent("0"));
        expect(window.sessionStorage.getItem(UNSAVED_CONVERSATION_KEY)).toBe(tagA);
        view.unmount();

        // A reload as org B: no conversation of org B was lost.
        render(
            <AskDevConversationProvider transport={new FakeTransport()}>
                <NotSaved />
            </AskDevConversationProvider>,
        );
        expect(screen.getByTestId("not-saved")).toHaveTextContent("false");
    });
});
