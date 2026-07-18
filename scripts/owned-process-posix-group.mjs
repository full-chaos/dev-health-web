import { spawnSync } from "node:child_process";
import { processIdentity } from "./owned-process-posix.mjs";

export function parseProcessIds(output) {
    const trimmed = output.trim();
    if (trimmed === "") return [];
    return trimmed
        .split(/\s+/)
        .map(Number)
        .filter((pid) => Number.isSafeInteger(pid) && pid > 0);
}

function groupProcessIds(groupId, inspect = spawnSync) {
    const result = inspect("pgrep", ["-g", String(groupId)], { encoding: "utf8" });
    if (result.status === 1) return [];
    if (result.status !== 0)
        throw new Error(`Unable to inspect owned process group: ${result.stderr}`);
    return parseProcessIds(result.stdout);
}

export function groupHasDescendants(groupId, guardianPid, inspect = spawnSync) {
    return groupProcessIds(groupId, inspect).some((pid) => pid !== guardianPid);
}

export function groupMemberIdentities(
    groupId,
    guardianPid,
    inspect = spawnSync,
    inspectIdentity = processIdentity,
) {
    return groupProcessIds(groupId, inspect)
        .filter((pid) => pid !== guardianPid)
        .flatMap((pid) => {
            const identity = inspectIdentity(pid);
            return identity === undefined ? [] : [identity];
        });
}
