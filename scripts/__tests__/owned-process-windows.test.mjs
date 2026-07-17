import { describe, expect, it } from "vitest";
import { createWindowsOwnedTreeController } from "../owned-process-windows.mjs";

const root = { createdAt: "2026-07-16T16:45:00.000Z", parentProcessId: 1, processId: 101 };
const child = { createdAt: "2026-07-16T16:45:01.000Z", parentProcessId: 101, processId: 202 };
const grandchild = {
    createdAt: "2026-07-16T16:45:02.000Z",
    parentProcessId: 202,
    processId: 303,
};

describe("Windows owned-process cleanup", () => {
    it("terminates a tracked owned descendant when its parent exits before cleanup", async () => {
        const snapshots = [[root, child, grandchild], [child, grandchild], []];
        const terminated = [];
        const controller = createWindowsOwnedTreeController({
            listProcesses: async () => snapshots.shift() ?? [],
            taskkill: async (processId) => {
                terminated.push(processId);
                return { status: 0 };
            },
            wait: async () => undefined,
        });

        await controller.track(root.processId);
        await controller.stop(root.processId);

        expect(terminated).toEqual([child.processId]);
    });

    it("fails closed when a tracked owned descendant remains after taskkill", async () => {
        const controller = createWindowsOwnedTreeController({
            listProcesses: async () => [root, child],
            maximumPolls: 1,
            taskkill: async () => ({ status: 0 }),
            wait: async () => undefined,
        });

        await controller.track(root.processId);

        await expect(controller.stop(root.processId)).rejects.toThrow(
            "Owned Windows process tree remained alive after taskkill.",
        );
    });
});
