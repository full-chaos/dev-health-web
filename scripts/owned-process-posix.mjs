import { spawnSync } from "node:child_process";

function isMissingProcess(error) {
    return error && typeof error === "object" && "code" in error && error.code === "ESRCH";
}

function isPermissionDenied(error) {
    return error && typeof error === "object" && "code" in error && error.code === "EPERM";
}

export function processGroupExists(processId, kill = process.kill) {
    try {
        kill(-processId, 0);
        return true;
    } catch (error) {
        if (isMissingProcess(error)) return false;
        if (isPermissionDenied(error)) return true;
        throw error;
    }
}

export function processIdentity(processId, inspect = spawnSync) {
    const result = inspect(
        "ps",
        ["-o", "pid=", "-o", "pgid=", "-o", "lstart=", "-p", String(processId)],
        {
            encoding: "utf8",
        },
    );
    if (result.status === 1) return undefined;
    if (result.status !== 0)
        throw new Error(`Unable to inspect owned process identity: ${result.stderr}`);
    const match = result.stdout.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (match === null) return undefined;
    return { pgid: Number(match[2]), pid: Number(match[1]), startedAt: match[3] };
}

export function processGroupIsOwned({ groupId, member }, inspectIdentity = processIdentity) {
    const current = inspectIdentity(member.pid);
    return current?.pgid === groupId && current.startedAt === member.startedAt;
}
