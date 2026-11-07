import { request } from "./_request";
import type { PlatformStats } from "../types";

export const platformApi = {
    stats: (token?: string) => request<PlatformStats>("/platform/stats", {}, token),
};

export const impersonationApi = {
    start: (targetUserId: string, token?: string) =>
        request<{
            status: string;
            target_user: { id: string; email: string; org_id: string; role: string };
            expires_at: string;
            // Only with AUTH_PROXY_IMPERSONATION on (the delegated token of the auth service).
            access_token?: string;
            session_access_token?: string;
            token_type?: string;
            expires_in?: number;
            /** The id of go-api's one-use record of this start (CHAOS-13184). */
            handoff_id?: string;
        }>(
            "/impersonate",
            { method: "POST", body: JSON.stringify({ target_user_id: targetUserId }) },
            token,
        ),

    /** Uses up the one-use record of a start handoff: 409 when it is used, gone or not the caller's. */
    consumeHandoff: (handoffId: string, token?: string) =>
        request<{ status: string }>(
            "/impersonate/handoff/consume",
            { method: "POST", body: JSON.stringify({ handoff_id: handoffId }) },
            token,
        ),

    stop: (token?: string) =>
        request<{ status: string }>("/impersonate/stop", { method: "POST" }, token),

    status: (token?: string) =>
        request<{
            is_impersonating: boolean;
            target_user_id: string | null;
            target_email: string | null;
            target_org_id: string | null;
            expires_at: string | null;
        }>("/impersonate/status", {}, token),
};
