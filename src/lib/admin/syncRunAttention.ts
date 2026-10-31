import { getSyncRunUnits } from "@/lib/admin/server";
import type { SyncRunUnit } from "@/lib/admin/types";

/** Most units each attention read asks for (the units read allows 1000 per page). */
export const SYNC_RUN_ATTENTION_CAP = 1000;

export interface SyncRunAttention {
    /** Failed, retrying and provider-capacity-waiting units, once each, up to the cap per read. */
    units: SyncRunUnit[];
    /** Units those two reads matched; above `units.length` when a read hit the cap. */
    total: number;
}

/**
 * The units that need attention, read apart from the table page: failed and
 * retrying units, and the units waiting for provider capacity (status
 * dispatching with error_category provider_budget_contention). Null when either
 * read fails, so a partial list is never shown as the whole.
 */
export async function readSyncRunAttention(runId: string): Promise<SyncRunAttention | null> {
    const [problems, waiting] = await Promise.all([
        getSyncRunUnits(runId, {
            status: "failed,retrying",
            limit: SYNC_RUN_ATTENTION_CAP,
            offset: 0,
        }),
        getSyncRunUnits(runId, {
            error_category: "provider_budget_contention",
            limit: SYNC_RUN_ATTENTION_CAP,
            offset: 0,
        }),
    ]);
    if (!problems?.data || !waiting?.data) return null;
    const byId = new Map<string, SyncRunUnit>();
    for (const unit of [...problems.data.units, ...waiting.data.units]) byId.set(unit.id, unit);
    const matched =
        (problems.data.filtered_unit_count ?? problems.data.units.length) +
        (waiting.data.filtered_unit_count ?? waiting.data.units.length);
    return { units: Array.from(byId.values()), total: Math.max(matched, byId.size) };
}
