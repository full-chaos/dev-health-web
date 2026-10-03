import type { SyncConfig } from "./types";

/**
 * The header line under the name: only what the configuration serves, as served. The schedule is
 * the stored cron text (no web-made wording such as "every 30 minutes"); a missing one reads
 * "Not scheduled".
 */
export function syncHeaderFacts(config: SyncConfig): string {
    const targets = config.sync_targets.length;
    return [
        `Provider: ${config.provider}`,
        `${targets} sync ${targets === 1 ? "target" : "targets"}`,
        config.schedule_cron
            ? `Schedule: ${config.schedule_cron}${config.timezone ? ` (${config.timezone})` : ""}`
            : "Not scheduled",
    ].join(" · ");
}
