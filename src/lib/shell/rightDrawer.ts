/**
 * One right drawer at a time (plan 2.5). The filter drawer, the Evidence & Context drawer and the
 * Ask Dev panel all sit on the right edge. Each owner claims the edge when it opens and releases
 * it when it closes; a claim by another owner closes the one that held it, through that owner's
 * own close function (so each owner keeps its own state and focus rules).
 */
export type RightDrawerOwner =
    | "ask-dev"
    | "audit-log"
    | "bug-report"
    | "drawer"
    | "evidence"
    | "filters";

let current: { owner: RightDrawerOwner; close: () => void } | null = null;

/** Takes the right edge. The previous owner, when it is another one, is asked to close. */
export function claimRightDrawer(owner: RightDrawerOwner, close: () => void): void {
    const previous = current;
    current = { owner, close };
    if (previous !== null && previous.owner !== owner) previous.close();
}

/** Gives the right edge back. A release by an owner that does not hold it does nothing. */
export function releaseRightDrawer(owner: RightDrawerOwner): void {
    if (current?.owner === owner) current = null;
}

/** For tests: who holds the right edge now. */
export function rightDrawerOwnerForTest(): RightDrawerOwner | null {
    return current?.owner ?? null;
}

/** For tests: forget every claim. */
export function resetRightDrawerForTest(): void {
    current = null;
}
