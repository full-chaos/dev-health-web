import { randomBytes } from "node:crypto";

/** A fake of go-api's one-use start handoff record: POST /api/v1/admin/impersonate/handoff/consume. */
export const HANDOFF_CONSUME_PATH = "/api/v1/admin/impersonate/handoff/consume";

export type ConsumeMode = "ok" | "503" | "500" | "401" | "network" | "unexpected";

export function fakeHandoffConsume() {
    const owners = new Map<string, string | undefined>();
    const consumed = new Set<string>();
    const calls: string[] = [];
    let mode: ConsumeMode = "ok";
    const json = (body: unknown, status: number) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
        });
    return {
        /** A record as the start writes it; with a bearer, only that administrator consumes it. */
        issue(bearer?: string): string {
            const id = randomBytes(32).toString("base64url");
            owners.set(id, bearer);
            return id;
        },
        /** The record is gone (its life ran out, an eviction, a restart). */
        drop(id: string): void {
            owners.delete(id);
        },
        setMode(next: ConsumeMode): void {
            mode = next;
        },
        calls: () => [...calls],
        handles: (input: RequestInfo | URL) => String(input).endsWith(HANDOFF_CONSUME_PATH),
        async answer(init?: RequestInit): Promise<Response> {
            const id = (JSON.parse(String(init?.body ?? "{}")) as { handoff_id?: unknown })
                .handoff_id;
            calls.push(String(id));
            if (mode === "network") throw new TypeError("fetch failed");
            if (mode === "unexpected") return json({ status: "ok" }, 200);
            if (mode !== "ok") return json({ detail: "unavailable" }, Number(mode));
            const bearer = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "");
            const known = typeof id === "string" && owners.has(id);
            const owner = known ? owners.get(id) : undefined;
            if (!known || (owner !== undefined && owner !== bearer) || consumed.has(id)) {
                return json({ detail: "Impersonation handoff not admitted" }, 409);
            }
            consumed.add(id);
            return json({ status: "consumed" }, 200);
        },
    };
}
