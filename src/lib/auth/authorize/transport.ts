import "server-only";
import { getServerEnv } from "@/lib/config";
import { getWorkloadToken } from "../workload/token";
import type { Transport } from "./client";

// Server-only /v1/authorize transport. The workload token goes in Authorization and nowhere else;
// the session reference stays in the body. No token, no request: the client turns the throw into a
// deny. No retry, no redirect, no logging.

const TIMEOUT_MS = 5_000;
const MAX_ANSWER_BYTES = 1_048_576;

export function createAuthorizeTransport(): Transport {
    return async (call) => {
        const base = getServerEnv().AUTH_INTERNAL_URL?.trim();
        const token = base ? await getWorkloadToken() : undefined;
        if (!base || !token) throw new Error("authorize transport: no workload token");
        let status: number;
        let body: string;
        try {
            const res = await fetch(base.replace(/\/+$/, "") + call.path, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: call.body,
                redirect: "error",
                cache: "no-store",
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            status = res.status;
            body = await res.text();
        } catch {
            throw new Error("authorize transport: request failed");
        }
        if (body.length > MAX_ANSWER_BYTES)
            throw new Error("authorize transport: answer too large");
        return { status, body };
    };
}
