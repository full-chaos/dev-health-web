import type { HealthResponse } from "@/lib/types";
import { apiClient } from "@/lib/apiClient";
import { withDeadline } from "@/lib/serverDeadline";

export async function checkApiHealth() {
    try {
        // INNER deadline in apiClient; OUTER deadline here (CHAOS-9114).
        const data = await withDeadline(
            apiClient.getJson<HealthResponse>("/health", undefined, {
                cache: "no-store",
                deadline: "health",
            }),
            { kind: "health", op: "step health" },
        );
        return { ok: data.status === "ok", data };
    } catch {
        return { ok: false, data: null as HealthResponse | null };
    }
}
