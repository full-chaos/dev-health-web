import "server-only";
import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";

/**
 * CHAOS-12088: the browser face of the Auth.js router (`/api/auth/*`).
 *
 * The session callback puts the Ops access token on the session object, because server code
 * (`auth()`, the proxy, route handlers, server actions) reads it there. `auth()` runs the Auth.js
 * session action inside the process; the HTTP route serves the SAME object to the browser, where
 * `useSession` and any other page script can read it. This module is the line between the two:
 *
 * - every JSON answer of the HTTP route loses the token keys, and is refused (500) if a token value
 *   is still in it under another key;
 * - a browser `update()` may not carry a token pair (`activeOrg`, `onboardComplete`). Only server
 *   code writes tokens into the session, through `updateServerSession` in `@/lib/auth`.
 */

const log = logger.child({ module: "auth-browser-session" });

/** Session keys that hold an Ops credential. Server code reads them; the browser never gets them. */
export const SERVER_ONLY_SESSION_KEYS = ["access_token", "refresh_token"] as const;

/** `update()` payload keys that carry an Ops token pair. Server code only (`updateServerSession`). */
export const SERVER_ONLY_UPDATE_KEYS = ["activeOrg", "onboardComplete"] as const;

type AuthRouteHandler = (request: NextRequest) => Promise<Response>;

function isJson(contentType: string | null): boolean {
    return contentType?.toLowerCase().includes("application/json") ?? false;
}

/**
 * The key of a browser `update()` payload that only server code may send, or null. It reads the
 * body the way Auth.js does (JSON only when the content type says so), so every payload Auth.js
 * would hand to the jwt callback as an object is checked.
 */
async function serverOnlyUpdateKey(request: NextRequest): Promise<string | null> {
    if (request.method !== "POST" || !isJson(request.headers.get("content-type"))) return null;
    let body: unknown;
    try {
        body = await request.clone().json();
    } catch {
        // Auth.js refuses the same body; nothing reaches the jwt callback.
        return null;
    }
    const data = (body as { data?: unknown } | null)?.data;
    if (!data || typeof data !== "object") return null;
    return SERVER_ONLY_UPDATE_KEYS.find((key) => key in data) ?? null;
}

/**
 * The answer with the server-only keys removed. Returns null when it cannot be served: a token
 * value is still in the body (copied under another key), or the body is not readable JSON.
 */
async function withoutServerOnlyKeys(response: Response): Promise<Response | null> {
    const text = await response.text();
    if (!text) return rebuild(response, text);
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        log.error({ status: response.status }, "auth route answered unreadable JSON; refused");
        return null;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return rebuild(response, text);

    const record = body as Record<string, unknown>;
    const removed: string[] = [];
    for (const key of SERVER_ONLY_SESSION_KEYS) {
        const value = record[key];
        if (typeof value === "string" && value) removed.push(value);
        delete record[key];
    }
    const served = JSON.stringify(record);
    if (removed.some((value) => served.includes(value))) {
        // Fail closed: a token copied under another key must not reach page JS.
        log.error(
            { status: response.status, keys: Object.keys(record) },
            "auth route answer still holds an Ops token after the token keys were removed; refused",
        );
        return null;
    }
    return rebuild(response, served);
}

function rebuild(response: Response, body: string): Response {
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function refused(status: number, error: string): Response {
    return new Response(JSON.stringify({ error }), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
}

/** Wraps an Auth.js route handler so that no Ops token crosses the HTTP route in either direction. */
export function browserSafeAuthHandler(handler: AuthRouteHandler): AuthRouteHandler {
    return async (request) => {
        const updateKey = await serverOnlyUpdateKey(request);
        if (updateKey) {
            log.warn(
                { method: request.method, key: updateKey },
                "browser session update carried a server-only token payload; refused",
            );
            return refused(400, "unsupported_session_update");
        }

        const response = await handler(request);
        if (!isJson(response.headers.get("content-type"))) return response;
        return (await withoutServerOnlyKeys(response)) ?? refused(500, "session_unavailable");
    };
}

/** `browserSafeAuthHandler` for both methods of the Auth.js router. */
export function browserSafeAuthHandlers(handlers: {
    GET: AuthRouteHandler;
    POST: AuthRouteHandler;
}): {
    GET: AuthRouteHandler;
    POST: AuthRouteHandler;
} {
    return {
        GET: browserSafeAuthHandler(handlers.GET),
        POST: browserSafeAuthHandler(handlers.POST),
    };
}
