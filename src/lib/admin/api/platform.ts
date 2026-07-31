import { request } from "./_request";
import type { PlatformAskDevReadinessResponse, PlatformStats } from "../types";

export const platformApi = {
    stats: (token?: string) => request<PlatformStats>("/platform/stats", {}, token),

    // Superuser-only platform Ask Dev readiness (CHAOS-3265). No org scope —
    // mirrors `stats` by omitting orgId entirely.
    askDevReadiness: {
        get: (token?: string) =>
            request<PlatformAskDevReadinessResponse>("/platform/ask-dev/readiness", {}, token),
        run: (token?: string) =>
            request<PlatformAskDevReadinessResponse>(
                "/platform/ask-dev/readiness",
                { method: "POST" },
                token,
            ),
    },
};

export const impersonationApi = {
    start: (targetUserId: string, token?: string) =>
        request<{
            status: string;
            target_user: { id: string; email: string; org_id: string; role: string };
            expires_at: string;
        }>(
            "/impersonate",
            { method: "POST", body: JSON.stringify({ target_user_id: targetUserId }) },
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
