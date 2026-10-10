import type { HealthResponse } from "@/lib/types";
import { apiClient } from "@/lib/apiClient";

export async function checkApiHealth() {
    try {
        const data = await apiClient.getJson<HealthResponse>("/health", undefined, {
            cache: "no-store",
            deadline: "health",
        });
        return { ok: data.status === "ok", data };
    } catch {
        return { ok: false, data: null as HealthResponse | null };
    }
}
