import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { browserSafeAuthHandler } from "@/lib/authBrowserSession";

const URL_SESSION = "http://localhost:3000/api/auth/session";

function json(body: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify(body), { ...init, headers });
}

describe("browserSafeAuthHandler (CHAOS-12088)", () => {
    it("removes the token keys and keeps the status, the rest of the body and every cookie", async () => {
        const headers = new Headers();
        headers.append("set-cookie", "authjs.session-token=abc; Path=/; HttpOnly");
        headers.append("set-cookie", "authjs.callback-url=x; Path=/");
        const handler = vi.fn(async () =>
            json(
                { user: { id: "u" }, expires: "e", access_token: "AT-1", refresh_token: "RT-1" },
                { status: 200, headers },
            ),
        );
        const res = await browserSafeAuthHandler(handler)(new NextRequest(URL_SESSION));

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ user: { id: "u" }, expires: "e" });
        expect(res.headers.getSetCookie()).toHaveLength(2);
        expect(res.headers.get("content-length")).toBeNull();
    });

    it("refuses (500) an answer that still holds a token value under another key", async () => {
        const handler = vi.fn(async () =>
            json({ user: { id: "u", token: "AT-copied" }, access_token: "AT-copied" }),
        );
        const res = await browserSafeAuthHandler(handler)(new NextRequest(URL_SESSION));

        expect(res.status).toBe(500);
        const text = await res.text();
        expect(text).not.toContain("AT-copied");
        expect(JSON.parse(text)).toEqual({ error: "session_unavailable" });
    });

    it("refuses (500) a JSON answer it cannot read", async () => {
        const handler = vi.fn(
            async () =>
                new Response("{not json AT-raw", {
                    headers: { "content-type": "application/json" },
                }),
        );
        const res = await browserSafeAuthHandler(handler)(new NextRequest(URL_SESSION));
        expect(res.status).toBe(500);
        expect(await res.text()).not.toContain("AT-raw");
    });

    it("serves null, an empty body and non-JSON answers (redirects, HTML) unchanged", async () => {
        const nullRes = await browserSafeAuthHandler(async () => json(null))(
            new NextRequest(URL_SESSION),
        );
        expect(await nullRes.json()).toBeNull();

        const redirect = new Response(null, {
            status: 302,
            headers: { location: "http://localhost:3000/dashboard" },
        });
        const res = await browserSafeAuthHandler(async () => redirect)(
            new NextRequest("http://localhost:3000/api/auth/callback/credentials", {
                method: "POST",
            }),
        );
        expect(res).toBe(redirect);
    });

    it.each(["activeOrg", "onboardComplete"])(
        "refuses (400) a browser update carrying %s before Auth.js sees it",
        async (key) => {
            const handler = vi.fn();
            const res = await browserSafeAuthHandler(handler)(
                new NextRequest(URL_SESSION, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        csrfToken: "c",
                        data: { [key]: { access_token: "x" } },
                    }),
                }),
            );
            expect(res.status).toBe(400);
            expect(handler).not.toHaveBeenCalled();
        },
    );

    it("passes other updates through with their body intact", async () => {
        const handler = vi.fn(async (req: NextRequest) => json(await req.json()));
        const body = { csrfToken: "c", data: { impersonationChanged: true } };
        const res = await browserSafeAuthHandler(handler)(
            new NextRequest(URL_SESSION, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            }),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(body);
    });

    it("leaves a form POST (sign-in, sign-out) to Auth.js", async () => {
        const handler = vi.fn(async () => new Response(null, { status: 302 }));
        const res = await browserSafeAuthHandler(handler)(
            new NextRequest("http://localhost:3000/api/auth/signout", {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: "csrfToken=c&data=activeOrg",
            }),
        );
        expect(res.status).toBe(302);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    // The input domain of the update check, one cell per row: [label, content type, body, refused].
    it.each([
        ["no data", "application/json", { csrfToken: "c" }, false],
        ["data null", "application/json", { csrfToken: "c", data: null }, false],
        ["data string", "application/json", { csrfToken: "c", data: "activeOrg" }, false],
        ["data array", "application/json", { csrfToken: "c", data: ["activeOrg"] }, false],
        [
            "other key",
            "application/json",
            { csrfToken: "c", data: { impersonationChanged: true } },
            false,
        ],
        ["activeOrg object", "application/json", { csrfToken: "c", data: { activeOrg: {} } }, true],
        ["activeOrg null", "application/json", { csrfToken: "c", data: { activeOrg: null } }, true],
        [
            "onboardComplete",
            "application/json",
            { csrfToken: "c", data: { onboardComplete: 1 } },
            true,
        ],
        ["both keys", "application/json", { data: { activeOrg: {}, onboardComplete: {} } }, true],
        ["json with charset", "application/json; charset=utf-8", { data: { activeOrg: {} } }, true],
        ["upper-case type", "Application/JSON", { data: { activeOrg: {} } }, true],
        ["text/plain JSON", "text/plain", { data: { activeOrg: {} } }, false],
    ] as const)("update cell: %s (refused=%s)", async (_label, type, body, refused) => {
        const handler = vi.fn(async () => json({ user: { id: "u" } }));
        const res = await browserSafeAuthHandler(handler)(
            new NextRequest(URL_SESSION, {
                method: "POST",
                headers: { "content-type": type },
                body: JSON.stringify(body),
            }),
        );
        expect(res.status).toBe(refused ? 400 : 200);
        expect(handler).toHaveBeenCalledTimes(refused ? 0 : 1);
    });

    it("refuses nothing on a GET, whatever its query says", async () => {
        const handler = vi.fn(async () => json(null));
        const res = await browserSafeAuthHandler(handler)(
            new NextRequest(`${URL_SESSION}?data=activeOrg`),
        );
        expect(res.status).toBe(200);
    });

    // The answer domain: [label, body, expected status, expected served body].
    it.each([
        ["tokens absent", { user: { id: "u" } }, 200, { user: { id: "u" } }],
        ["token null", { user: { id: "u" }, access_token: null }, 200, { user: { id: "u" } }],
        ["token empty", { user: { id: "u" }, access_token: "" }, 200, { user: { id: "u" } }],
        ["refresh only", { user: { id: "u" }, refresh_token: "RT-9" }, 200, { user: { id: "u" } }],
        [
            "error kept",
            { user: { id: "u" }, access_token: "AT-9", error: "refresh_unavailable" },
            200,
            { user: { id: "u" }, error: "refresh_unavailable" },
        ],
        [
            "copied into error",
            { access_token: "AT-9", error: "AT-9" },
            500,
            { error: "session_unavailable" },
        ],
        [
            "copied into nested",
            { access_token: "AT-9", user: { a: [{ b: "x AT-9 y" }] } },
            500,
            { error: "session_unavailable" },
        ],
        ["array body", ["a"], 200, ["a"]],
        ["csrf answer", { csrfToken: "c" }, 200, { csrfToken: "c" }],
    ] as const)("answer cell: %s", async (_label, body, status, served) => {
        const res = await browserSafeAuthHandler(async () => json(body))(
            new NextRequest(URL_SESSION),
        );
        expect(res.status).toBe(status);
        expect(await res.json()).toEqual(served);
    });
});
