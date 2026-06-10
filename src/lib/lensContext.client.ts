"use client";

/**
 * Client-only Lens context hook.
 *
 * Kept in a separate module so that server components can safely import the
 * pure utility functions from "@/lib/lensContext" without pulling in
 * next/navigation (which is client-only).
 */
import { useSearchParams } from "next/navigation";

import { DEFAULT_ROLE, getLensFromSearchParams } from "./lensContext";
import type { LensId, RoleType } from "./lensContext";

/** Hook — returns the active lens ID, defaulting to "neutral". Client-only. */
export function useActiveLens(): LensId {
    const searchParams = useSearchParams();
    return getLensFromSearchParams(searchParams) ?? "neutral";
}

/**
 * Hook — the active role implied by the Lens control (CHAOS-2249).
 *
 * The Lens control writes `lens=` to the URL and deletes `role=`, so
 * role-shaped consumers (evidence rail, investigation panel) must read the
 * lens first and treat `role=` only as a legacy alias — otherwise switching
 * the lens silently changes nothing on those surfaces. The neutral lens maps
 * to the default role.
 */
export function useActiveRole(): RoleType {
    const lens = useActiveLens();
    return lens === "neutral" ? DEFAULT_ROLE : lens;
}
