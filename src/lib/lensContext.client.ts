"use client";

/**
 * Client-only Lens context hook.
 *
 * Kept in a separate module so that server components can safely import the
 * pure utility functions from "@/lib/lensContext" without pulling in
 * next/navigation (which is client-only).
 */
import { useSearchParams } from "next/navigation";

import { getLensFromSearchParams } from "./lensContext";
import type { LensId } from "./lensContext";

/** Hook — returns the active lens ID, defaulting to "neutral". Client-only. */
export function useActiveLens(): LensId {
    const searchParams = useSearchParams();
    return getLensFromSearchParams(searchParams) ?? "neutral";
}
