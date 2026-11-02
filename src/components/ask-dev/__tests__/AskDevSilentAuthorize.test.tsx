import { createHash } from "node:crypto";

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    },
}));

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({
    usePathname: () => nav.pathname,
    useSearchParams: () => new URLSearchParams(""),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const auth = vi.hoisted(() => ({ session: null as unknown as Session, getSession: vi.fn() }));
vi.mock("next-auth/react", () => ({
    useSession: () => ({ data: auth.session, status: "authenticated" }),
    getSession: auth.getSession,
}));

import { HISTORY_COPY, NOT_RUN_COPY, TRANSCRIPT_COPY } from "@full-chaos/ask-dev/render";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { acrBrowserClientOff, acrBrowserClientOn } from "@/test/acrBrowserClient";
import {
    ACR_AUTHORIZE_ROUTE,
    ACR_TOKEN_FAMILY_KEY,
    setAcrAuthDependenciesForTest,
} from "@/lib/ask-dev/acr-auth";
import { resetRightDrawerForTest } from "@/lib/shell/rightDrawer";

import { AskDevFullPage } from "../AskDevFullPage";
import { AskDevPanel } from "../AskDevPanel";
import { AskDevShellProvider, useAskDevShell } from "../AskDevShellContext";
import { AskDevEvidence } from "../conversation/AskDevEvidence";
import {
    AskDevConversationProvider,
    useAskDevConversation,
} from "../conversation/AskDevConversationContext";
import { THREAD_HINT_KEY } from "../conversation/conversationStore";
import { partitionTag } from "../conversation/keys";

/**
 * CHAOS-12474: the moments of the silent step, on the real surfaces. No fake sits between them and
 * the wire: the real provider, panel, store, browser transport and token store run, and only
 * `fetch` is a stub. The render's rail is hidden by the host's narrow panel through the stylesheet,
 * which jsdom does not apply, so a test that is about the panel hides it the same way: a real
 * `display: none`, read by the render with `getComputedStyle`.
 *
 * The panel's render loads on the first open. Every assertion here waits for its composer, so "0
 * requests" is measured on a mounted panel and not on one that has not loaded yet.
 */

const ISSUER = "http://127.0.0.1:8080";
const API = `${ISSUER}/api/v1/context-fabric`;
const TOKEN = (letter: string) => `fcacr_${letter.repeat(43)}`;
const REFRESH = `acrrt_${"R".repeat(43)}`;
const USER = { id: "user-1", org_id: "org-1" };
const THREAD = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PARTITION = ["org-1", "user-1", ""].join("\u0000");
const TS = "2026-01-02T03:04:05Z";
const QUESTION = "Which projects are at risk?";

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });

const errorBody = (code: string, status: number) => ({
    schema_version: "error.v1",
    request_id: "req_refused",
    error: { code, message: "refused", http_status: status, retryable: false },
});

const LIST = {
    schema_version: "context_fabric_thread_list.v1",
    threads: [
        {
            thread_id: THREAD,
            retention_days: 30,
            turn_count: 1,
            created_at: TS,
            last_turn_at: TS,
            expires_at: "2027-01-02T03:04:05Z",
            first_question: "An earlier question",
        },
    ],
};

type Call = { readonly url: string; readonly init: RequestInit };

let calls: Call[];
let issued: number;
let routeAnswer: (body: { code_challenge: string; state: string }) => Response | Promise<Response>;
let investigationAnswer: () => Response;
let listAnswer: () => Response;
let evidenceAnswer: () => Response;
/** With a refresh token the store refreshes after a 401; with none it must authorize again. */
let withFamily: boolean;

function acrFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const url = String(input);
    calls.push({ url, init });
    if (url === `${ISSUER}/.well-known/oauth-authorization-server`) {
        return Promise.resolve(
            json(200, {
                issuer: ISSUER,
                authorization_endpoint: `${ISSUER}/authorize`,
                token_endpoint: `${ISSUER}/token`,
                revocation_endpoint: `${ISSUER}/revoke`,
                code_challenge_methods_supported: ["S256"],
                authorization_response_iss_parameter_supported: true,
            }),
        );
    }
    if (url === "/api/auth/session") return Promise.resolve(json(200, auth.session));
    if (url === ACR_AUTHORIZE_ROUTE) {
        return Promise.resolve(
            routeAnswer(JSON.parse(String(init.body)) as Parameters<typeof routeAnswer>[0]),
        );
    }
    if (url === `${ISSUER}/token`) {
        issued += 1;
        return Promise.resolve(
            json(200, {
                access_token: TOKEN(String.fromCharCode(64 + issued)),
                token_type: "Bearer",
                expires_in: 600,
                ...(withFamily ? { refresh_token: REFRESH } : {}),
            }),
        );
    }
    if (url === `${API}/investigations`) return Promise.resolve(investigationAnswer());
    if (url.startsWith(`${API}/threads`)) return Promise.resolve(listAnswer());
    if (url.includes("/api/v1/agent-context/evidence/")) return Promise.resolve(evidenceAnswer());
    return Promise.resolve(new Response(null, { status: 599 }));
}

const urls = () => calls.map(({ url }) => url);
const countOf = (url: string) => urls().filter((called) => called === url).length;
const routeCalls = () => countOf(ACR_AUTHORIZE_ROUTE);
const tokenCalls = () => countOf(`${ISSUER}/token`);
const investigationCalls = () => calls.filter(({ url }) => url === `${API}/investigations`);
const bearerOf = ({ init }: Call) => (init.headers as Record<string, string>).Authorization;

/**
 * SHA-256 on this thread. `crypto.subtle.digest` answers from Node's thread pool, the one step of a
 * silent attempt that a timer can overtake: on a busy runner it lost to a 1 s wait, and the attempt
 * lived on into the next test, where its request read as a second attempt. The bytes are the same,
 * and `acr-auth.test.ts` pins the real call on RFC 7636's vector.
 */
const digestOnThisThread = (_algorithm: AlgorithmIdentifier, data: BufferSource) =>
    Promise.resolve(
        Uint8Array.from(
            createHash("sha256")
                .update(data as Uint8Array)
                .digest(),
        ).buffer,
    );

function hideTheRail(): void {
    const style = document.createElement("style");
    style.id = "panel-width";
    style.textContent = ".ask__rail--left { display: none; }";
    document.head.append(style);
}

function ShellProbe() {
    const { setOpen } = useAskDevShell();
    return (
        <button type="button" onClick={() => setOpen(true)}>
            test-open
        </button>
    );
}

function renderSurface(surface = <AskDevPanel />) {
    return render(
        <AdminTierProvider tier="team" features={{ ask_dev: true, agent_context_runtime: true }}>
            <AskDevShellProvider>
                <AskDevConversationProvider>
                    <ShellProbe />
                    {surface}
                </AskDevConversationProvider>
            </AskDevShellProvider>
        </AdminTierProvider>,
    );
}

const panel = () => screen.getByTestId("ask-dev-panel");
const composer = () => within(panel()).findByRole("textbox", { name: "Ask a question" });

async function settle() {
    for (let turn = 0; turn < 10; turn += 1) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }
}

/** The real panel, open, with its render mounted and its effects run. */
async function openPanel() {
    renderSurface();
    await userEvent.click(screen.getByRole("button", { name: "test-open" }));
    await composer();
    await settle();
}

async function ask() {
    await userEvent.type(await composer(), `${QUESTION}{Enter}`);
}

async function toggleHistory() {
    await userEvent.click(await within(panel()).findByTestId("ask-dev-history-toggle"));
}

beforeEach(() => {
    calls = [];
    issued = 0;
    withFamily = true;
    routeAnswer = ({ state }) => json(200, { code: "c-1", state, iss: ISSUER });
    investigationAnswer = () => json(403, errorBody("feature_not_enabled", 403));
    listAnswer = () => json(200, LIST);
    evidenceAnswer = () => new Response(null, { status: 404 });
    nav.pathname = "/dashboard";
    auth.session = { user: USER, expires: "2099-01-01" } as Session;
    auth.getSession.mockReset();
    auth.getSession.mockImplementation(async () => auth.session);
    window.sessionStorage.clear();
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal("fetch", vi.fn(acrFetch));
    vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementation(digestOnThisThread);
    acrBrowserClientOn();
    hideTheRail();
});

afterEach(() => {
    document.getElementById("panel-width")?.remove();
    resetRightDrawerForTest();
    setAcrAuthDependenciesForTest();
    acrBrowserClientOff();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("a panel open (P1-6)", () => {
    it("sends 0 requests from the real panel, with no token", async () => {
        await openPanel();
        expect(calls).toEqual([]);
        expect(auth.getSession).not.toHaveBeenCalled();
    });

    it("sends 0 requests with a family held", async () => {
        window.sessionStorage.setItem(
            ACR_TOKEN_FAMILY_KEY,
            JSON.stringify({
                v: 2,
                familyId: "F".repeat(22),
                issuer: ISSUER,
                clientId: "https://localhost/acr/dev-browser-client",
                refreshToken: REFRESH,
                tokenEndpoint: `${ISSUER}/token`,
                revocationEndpoint: `${ISSUER}/revoke`,
                userId: USER.id,
                orgId: USER.org_id,
            }),
        );
        await openPanel();
        expect(calls).toEqual([]);
    });

    it("a restore that runs on load is a background read: no silent step, and no request", async () => {
        window.sessionStorage.setItem(
            THREAD_HINT_KEY,
            JSON.stringify({
                thread_id: THREAD,
                partition: partitionTag(PARTITION),
                expires_at: null,
            }),
        );
        renderSurface();
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await settle();
        expect(calls).toEqual([]);
        // It is a failed read with a Try again, which is the user's act.
        await userEvent.click(await within(panel()).findByTestId("ask-dev-conversation-retry"));
        await waitFor(() => expect(routeCalls()).toBe(1));
    });

    it("renders the closed history and reads no list", async () => {
        await openPanel();
        expect(window.getComputedStyle(document.querySelector(".ask__rail--left")!).display).toBe(
            "none",
        );
        expect(urls().filter((url) => url.includes("/threads"))).toEqual([]);
    });
});

describe("the first question", () => {
    it("authorizes once, with no navigation, and goes out with the token", async () => {
        const before = window.location.href;
        await openPanel();
        await ask();
        await waitFor(() => expect(investigationCalls()).toHaveLength(1));
        expect(urls()).toEqual([
            `${ISSUER}/.well-known/oauth-authorization-server`,
            ACR_AUTHORIZE_ROUTE,
            `${ISSUER}/token`,
            `${API}/investigations`,
        ]);
        expect(bearerOf(investigationCalls()[0]!)).toBe(`Bearer ${TOKEN("A")}`);
        expect(window.location.href).toBe(before);
    });

    it("never sends the verifier to web: only ACR's /token sees it", async () => {
        await openPanel();
        await ask();
        await waitFor(() => expect(investigationCalls()).toHaveLength(1));
        const verifier = new URLSearchParams(
            calls.find(({ url }) => url === `${ISSUER}/token`)!.init.body as URLSearchParams,
        ).get("code_verifier")!;
        expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);
        const route = calls.find(({ url }) => url === ACR_AUTHORIZE_ROUTE)!;
        expect(Object.keys(JSON.parse(String(route.init.body))).sort()).toEqual([
            "code_challenge",
            "state",
        ]);
        for (const { url, init } of calls.filter((call) => !call.url.endsWith("/token"))) {
            expect(`${url} ${JSON.stringify(init.headers)} ${String(init.body)}`).not.toContain(
                verifier,
            );
        }
    });

    it("a question and History racing make one authorization", async () => {
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        routeAnswer = async ({ state }) => {
            await gate;
            return json(200, { code: "c-1", state, iss: ISSUER });
        };
        await openPanel();
        await ask();
        await waitFor(() => expect(routeCalls()).toBe(1));
        await toggleHistory();
        await settle();
        release();
        await waitFor(() => expect(investigationCalls()).toHaveLength(1));
        await waitFor(() => expect(urls().some((url) => url.includes("/threads"))).toBe(true));
        expect(routeCalls()).toBe(1);
        expect(tokenCalls()).toBe(1);
    });

    // Codex r1 P2 on #1714: with no known asker, no code can be asked for.
    it("a session read that gives nothing makes no attempt, and Retry tries again", async () => {
        auth.getSession.mockResolvedValue(null);
        await openPanel();
        await ask();
        const status = await within(panel()).findByTestId("chat-status");
        await settle();
        expect(status).toHaveAttribute("data-status", "failed");
        expect(routeCalls()).toBe(0);
        expect(tokenCalls()).toBe(0);
        expect(investigationCalls()).toEqual([]);
        expect(window.sessionStorage.getItem(ACR_TOKEN_FAMILY_KEY)).toBeNull();

        auth.getSession.mockImplementation(async () => auth.session);
        await userEvent.click(within(panel()).getByRole("button", { name: "Retry" }));
        await waitFor(() => expect(investigationCalls()).toHaveLength(1));
        expect(routeCalls()).toBe(1);
    });

    it("a 401 authorizes once more, resends once, and then stops: never a loop", async () => {
        withFamily = false;
        investigationAnswer = () => json(401, {});
        await openPanel();
        await ask();
        const status = await within(panel()).findByTestId("chat-status");
        await settle();
        expect(routeCalls()).toBe(2);
        expect(investigationCalls()).toHaveLength(2);
        expect(investigationCalls().map(bearerOf)).toEqual([
            `Bearer ${TOKEN("A")}`,
            `Bearer ${TOKEN("B")}`,
        ]);
        expect(status).toHaveAttribute("data-status", "failed");
    });

    it("a failed attempt shows Retry, and each click is one more attempt", async () => {
        routeAnswer = () => json(503, { error: { code: "acr_unavailable" } });
        await openPanel();
        await ask();
        await within(panel()).findByTestId("chat-status");
        await settle();
        expect(routeCalls()).toBe(1);
        expect(investigationCalls()).toEqual([]);
        routeAnswer = ({ state }) => json(200, { code: "c-1", state, iss: ISSUER });
        await userEvent.click(within(panel()).getByRole("button", { name: "Retry" }));
        await waitFor(() => expect(investigationCalls()).toHaveLength(1));
        expect(routeCalls()).toBe(2);
    });

    it.each([
        ["ACR's limit", "rate_limited"],
        ["web's budget for one user", "user_rate_limited"],
    ])("%s is a named failure with Retry: nothing tries again by itself", async (_, code) => {
        routeAnswer = () => json(429, { error: { code } });
        await openPanel();
        await ask();
        const status = await within(panel()).findByTestId("chat-status");
        await settle();
        expect(status).toHaveAttribute("data-status", "not_run");
        expect(routeCalls()).toBe(1);
        expect(within(panel()).getByRole("button", { name: "Retry" })).toBeVisible();
    });
});

// CHAOS-12469: ACR's OAuth routes run no access read, so the silent step cannot see this 503. It
// comes on the first data call after it, and it stays that call's no-retry state.
describe("an organization above its access limit, after the silent step", () => {
    const OVER_LIMIT = () => json(503, errorBody("upstream_unavailable", 503));

    it("a question: not available here, no Retry, and no second attempt", async () => {
        investigationAnswer = OVER_LIMIT;
        await openPanel();
        await ask();
        const status = await within(panel()).findByTestId("chat-status");
        await settle();
        expect(status).toHaveAttribute("data-status", "not_run");
        expect(status).toHaveTextContent(NOT_RUN_COPY.not_entitled);
        expect(within(panel()).queryByRole("button", { name: "Retry" })).toBeNull();
        expect(routeCalls()).toBe(1);
        expect(investigationCalls()).toHaveLength(1);
    });

    it("History: its own state, no Try again, and no second attempt", async () => {
        listAnswer = OVER_LIMIT;
        await openPanel();
        await toggleHistory();
        await within(panel()).findByTestId("ask-dev-history-unavailable");
        expect(within(panel()).queryByTestId("ask-dev-history-retry")).toBeNull();
        expect(panel().textContent).not.toContain(HISTORY_COPY.empty);
        expect(routeCalls()).toBe(1);
    });
});

describe("History", () => {
    it("opening it is a user's act: it authorizes once, and the list comes", async () => {
        await openPanel();
        expect(calls).toEqual([]);
        await toggleHistory();
        await within(panel()).findByTestId("ask-dev-history-list");
        expect(routeCalls()).toBe(1);
        const list = calls.find(({ url }) => url.includes("/threads"))!;
        expect(bearerOf(list)).toBe(`Bearer ${TOKEN("A")}`);
    });

    it("before a token it says it is loading, and never claims no conversations", async () => {
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        routeAnswer = async ({ state }) => {
            await gate;
            return json(200, { code: "c-1", state, iss: ISSUER });
        };
        await openPanel();
        await toggleHistory();
        await within(panel()).findByTestId("ask-dev-history-loading");
        expect(panel().textContent).not.toContain(HISTORY_COPY.empty);
        release();
        await within(panel()).findByTestId("ask-dev-history-list");
    });

    it("a failed attempt reads as a failed read, with no claim, and Try again is one attempt", async () => {
        routeAnswer = () => json(503, { error: { code: "acr_unavailable" } });
        await openPanel();
        await toggleHistory();
        await within(panel()).findByTestId("ask-dev-history-read-failed");
        expect(panel().textContent).not.toContain(HISTORY_COPY.empty);
        expect(routeCalls()).toBe(1);
        routeAnswer = ({ state }) => json(200, { code: "c-1", state, iss: ISSUER });
        await userEvent.click(within(panel()).getByTestId("ask-dev-history-retry"));
        await within(panel()).findByTestId("ask-dev-history-list");
        expect(routeCalls()).toBe(2);
    });

    it("with a token and no conversations, it does say so: that is a read", async () => {
        listAnswer = () => json(200, { schema_version: LIST.schema_version, threads: [] });
        await openPanel();
        await toggleHistory();
        await within(panel()).findByTestId("ask-dev-history-empty");
    });

    it("the rail on screen on /dev is History open, on the page the user opened", async () => {
        document.getElementById("panel-width")?.remove();
        nav.pathname = "/dev";
        renderSurface(<AskDevFullPage />);
        await waitFor(() => expect(routeCalls()).toBe(1));
        await screen.findByTestId("ask-dev-history-list");
    });
});

describe("a conversation", () => {
    it("opened from the list reads with the token History got, with no second attempt", async () => {
        listAnswer = () => json(200, LIST);
        await openPanel();
        await toggleHistory();
        await within(panel()).findByTestId("ask-dev-history-list");
        await userEvent.click(within(panel()).getByTestId("ask-dev-history-open"));
        await settle();
        expect(routeCalls()).toBe(1);
        expect(panel().textContent).not.toContain(TRANSCRIPT_COPY.lockedRestoring);
    });
});

describe("evidence", () => {
    function EvidenceProbe() {
        const live = useAskDevConversation();
        if (live === null || !live.snapshot.ready) return null;
        return (
            <AskDevEvidence
                store={live.store}
                evidence={{ refId: "ref-1", resultId: "result-1", label: "A reference" }}
                generation={live.snapshot.generation}
                onOrganizationChanged={() => undefined}
            />
        );
    }

    it("opening it is a user's act: it authorizes once, then reads", async () => {
        renderSurface(<EvidenceProbe />);
        await waitFor(() =>
            expect(urls().some((url) => url.includes("/agent-context/evidence/"))).toBe(true),
        );
        expect(routeCalls()).toBe(1);
    });

    it("a failed attempt offers Try again, and each click is one attempt", async () => {
        routeAnswer = () => json(503, { error: { code: "acr_unavailable" } });
        renderSurface(<EvidenceProbe />);
        const again = await screen.findByRole("button", { name: "Try again" });
        expect(document.body.textContent).not.toMatch(/\bconnect\b/iu);
        expect(routeCalls()).toBe(1);
        routeAnswer = ({ state }) => json(200, { code: "c-1", state, iss: ISSUER });
        await userEvent.click(again);
        await waitFor(() =>
            expect(urls().some((url) => url.includes("/agent-context/evidence/"))).toBe(true),
        );
        expect(routeCalls()).toBe(2);
    });
});
