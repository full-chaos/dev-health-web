"use client";

import { useEffect, useRef } from "react";

import { claimRightDrawer, releaseRightDrawer, type RightDrawerOwner } from "./rightDrawer";

/**
 * Holds the right edge while `open` is true (see `rightDrawer.ts`). Another owner opening calls
 * `close`; the claim is released when `open` turns false or the component unmounts. For a drawer
 * whose open state is a plain boolean of its owner.
 */
export function useRightDrawerClaim(
    owner: RightDrawerOwner,
    open: boolean,
    close: () => void,
): void {
    const closeRef = useRef(close);
    useEffect(() => {
        closeRef.current = close;
    }, [close]);
    useEffect(() => {
        if (!open) return;
        claimRightDrawer(owner, () => closeRef.current());
        return () => releaseRightDrawer(owner);
    }, [owner, open]);
}
