import type { HealthResponse } from "@/lib/types";
import { apiClient } from "@/lib/apiClient";
import { withDeadline } from "@/lib/serverDeadline";
import { logger } from "@/lib/logger";

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
        if (data.status !== "ok") {
            logger.warn({ status: data.status }, "checkApiHealth: API health status is not ok");
        }
        return { ok: data.status === "ok", data };
    } catch (err) {
        logger.warn({ err }, "checkApiHealth: API health check failed");
        return { ok: false, data: null as HealthResponse | null };
    }
}
