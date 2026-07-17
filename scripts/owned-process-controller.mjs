import { createWindowsOwnedTreeController } from "./owned-process-windows.mjs";

export function selectOwnedTreeController({
    createWindowsTree = createWindowsOwnedTreeController,
    onHelperExit,
    platform = process.platform,
} = {}) {
    return platform === "win32" ? createWindowsTree({ onHelperExit }) : undefined;
}
