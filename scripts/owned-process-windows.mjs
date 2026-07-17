import { spawn } from "node:child_process";
import { OWNED_PROCESS_ESCALATION_TIMEOUT_MS } from "./owned-process-lifecycle.mjs";

const POLL_INTERVAL_MS = 25;
const PROCESS_QUERY =
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate | ConvertTo-Json -Compress";

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processKey(processInfo) {
    return `${processInfo.processId}:${processInfo.createdAt}`;
}

function sameProcess(left, right) {
    return left.processId === right.processId && left.createdAt === right.createdAt;
}

function processByIdentity(processes, expected) {
    return processes.find((processInfo) => sameProcess(processInfo, expected));
}

function descendantsFrom(roots, processes) {
    const childrenByParent = new Map();
    for (const processInfo of processes) {
        const children = childrenByParent.get(processInfo.parentProcessId) ?? [];
        children.push(processInfo);
        childrenByParent.set(processInfo.parentProcessId, children);
    }

    const descendants = new Map();
    const pending = [...roots];
    while (pending.length > 0) {
        const processInfo = pending.pop();
        if (processInfo === undefined || descendants.has(processKey(processInfo))) continue;
        descendants.set(processKey(processInfo), processInfo);
        pending.push(...(childrenByParent.get(processInfo.processId) ?? []));
    }
    return [...descendants.values()];
}

function rootsForLiveTrackedProcesses(tracked, processes) {
    const liveTracked = [...tracked.values()].flatMap((expected) => {
        const current = processByIdentity(processes, expected);
        return current === undefined ? [] : [current];
    });
    return liveTracked.filter(
        (candidate) =>
            !liveTracked.some(
                (possibleParent) => candidate.parentProcessId === possibleParent.processId,
            ),
    );
}

function unverifiedDescendantExists(tracked, owned, processes) {
    const ownedKeys = new Set(owned.map(processKey));
    const trackedPids = new Set([...tracked.values()].map((processInfo) => processInfo.processId));
    return processes.some(
        (processInfo) =>
            !ownedKeys.has(processKey(processInfo)) && trackedPids.has(processInfo.parentProcessId),
    );
}

function parseWindowsProcessList(output) {
    const parsed = JSON.parse(output);
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values.flatMap((value) => {
        if (
            typeof value !== "object" ||
            value === null ||
            !Number.isSafeInteger(value.ProcessId) ||
            !Number.isSafeInteger(value.ParentProcessId) ||
            typeof value.CreationDate !== "string"
        ) {
            return [];
        }
        return [
            {
                createdAt: value.CreationDate,
                parentProcessId: value.ParentProcessId,
                processId: value.ProcessId,
            },
        ];
    });
}

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ["ignore", "pipe", "ignore"],
            windowsHide: true,
        });
        const output = [];
        child.stdout.on("data", (chunk) => output.push(chunk));
        child.once("error", reject);
        child.once("close", (status) =>
            resolve({ output: Buffer.concat(output).toString("utf8"), status }),
        );
    });
}

async function listWindowsProcesses() {
    const result = await run("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        PROCESS_QUERY,
    ]);
    if (result.status !== 0) throw new Error("Unable to query the Windows process tree.");
    return result.output.trim() ? parseWindowsProcessList(result.output) : [];
}

async function taskkill(processId) {
    const result = await run("taskkill", ["/pid", String(processId), "/T", "/F"]);
    return { status: result.status };
}

export function createWindowsOwnedTreeController({
    listProcesses = listWindowsProcesses,
    maximumPolls = Math.ceil(OWNED_PROCESS_ESCALATION_TIMEOUT_MS / POLL_INTERVAL_MS),
    taskkill: terminateTree = taskkill,
    wait: waitForPoll = wait,
} = {}) {
    const tracked = new Map();

    return {
        async track(rootProcessId) {
            const processes = await listProcesses();
            const root = processes.find((processInfo) => processInfo.processId === rootProcessId);
            if (root === undefined)
                throw new Error("Owned Windows root process was not available for tracking.");
            for (const processInfo of descendantsFrom([root], processes)) {
                tracked.set(processKey(processInfo), processInfo);
            }
        },
        async stop(rootProcessId) {
            const processes = await listProcesses();
            const roots = rootsForLiveTrackedProcesses(tracked, processes).filter(
                (processInfo) =>
                    processInfo.processId === rootProcessId || tracked.has(processKey(processInfo)),
            );
            const owned = descendantsFrom(roots, processes);
            if (unverifiedDescendantExists(tracked, owned, processes)) {
                throw new Error("Unable to verify the exact owned Windows process tree.");
            }
            for (const processInfo of owned) tracked.set(processKey(processInfo), processInfo);
            for (const root of roots) await terminateTree(root.processId);

            for (let poll = 0; poll < maximumPolls; poll += 1) {
                const current = await listProcesses();
                if (!owned.some((expected) => processByIdentity(current, expected) !== undefined))
                    return;
                if (poll + 1 < maximumPolls) await waitForPoll(POLL_INTERVAL_MS);
            }
            throw new Error("Owned Windows process tree remained alive after taskkill.");
        },
    };
}
