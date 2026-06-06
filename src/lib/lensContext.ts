/**
 * Lens context — perspective-only framing that lives in the global context bar.
 *
 * Reads `lens=` from the URL (with `role=` accepted as a legacy alias for
 * back-compat with the ~30 pages that thread `?role=`).
 *
 * Lens is a perspective control only. It NEVER changes which data is queried
 * or which filter payload is sent to the backend — only ordering / copy /
 * emphasis changes.
 */

import {
	type RoleType,
	type RoleConfig,
	ROLE_CONFIGS,
	ROLE_OPTIONS,
	DEFAULT_ROLE,
	getRoleConfig,
	isValidRole,
} from "./roleContext";

// Re-export every roleContext symbol so existing consumers compile unchanged.
export type { RoleType, RoleConfig };
export { ROLE_CONFIGS, ROLE_OPTIONS, DEFAULT_ROLE, getRoleConfig, isValidRole };

// ---------------------------------------------------------------------------
// Lens types
// ---------------------------------------------------------------------------

/** Neutral has no reframing effect; role-derived lenses apply investigationOrder. */
export type LensId = RoleType | "neutral";

export type LensConfig = {
	id: LensId;
	label: string;
	shortLabel: string;
	/** Framing copy shown as contextual description. Empty string for neutral. */
	framing: string;
	primaryQuadrant: RoleConfig["primaryQuadrant"] | null;
	secondaryQuadrant: RoleConfig["secondaryQuadrant"] | null;
	investigationOrder: readonly string[];
};

// ---------------------------------------------------------------------------
// Config data
// ---------------------------------------------------------------------------

const NEUTRAL_LENS: LensConfig = {
	id: "neutral",
	label: "Default",
	shortLabel: "Default",
	framing: "",
	primaryQuadrant: null,
	secondaryQuadrant: null,
	investigationOrder: [],
};

/** All lens IDs in display order: role-derived first, neutral last. */
export const LENS_IDS: LensId[] = [...ROLE_OPTIONS, "neutral"];

/** Return the LensConfig for a given lens id, defaulting to neutral. */
export const getLensConfig = (lens?: string | null): LensConfig => {
	if (!lens || lens === "neutral") return NEUTRAL_LENS;
	if (isValidRole(lens)) {
		const rc = ROLE_CONFIGS[lens];
		return {
			id: lens,
			label: rc.label,
			shortLabel: rc.shortLabel,
			framing: rc.framing,
			primaryQuadrant: rc.primaryQuadrant,
			secondaryQuadrant: rc.secondaryQuadrant,
			investigationOrder: rc.investigationOrder,
		};
	}
	return NEUTRAL_LENS;
};

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Read the active lens from a URLSearchParams instance.
 * Reads `lens=` first; falls back to `role=` for legacy compatibility.
 * Returns null when neither param is present or valid.
 */
export const getLensFromSearchParams = (
	params: URLSearchParams,
): LensId | null => {
	const lens = params.get("lens");
	if (lens === "neutral") return "neutral";
	if (lens && isValidRole(lens)) return lens;

	// Legacy alias: role= is still accepted but not preferred.
	const role = params.get("role");
	if (role && isValidRole(role)) return role;

	return null;
};

// ---------------------------------------------------------------------------
// React hook (client-only) — re-exported from lensContext.client.ts
// ---------------------------------------------------------------------------
// useActiveLens is intentionally NOT exported from this file.
// Import it from "@/lib/lensContext.client" in client components.

// ---------------------------------------------------------------------------
// Ordering utility
// ---------------------------------------------------------------------------

/**
 * Reorder `items` by the lens's `investigationOrder` for the given surface.
 * Items whose `id` does not appear in `investigationOrder` are appended in
 * their original relative order. Returns a new array; never mutates input.
 * When the lens is neutral (no investigationOrder), original order is preserved.
 */
export function applyLensPriority<T extends { id: string }>(
	items: readonly T[],
	lensId: LensId,
	_surface: "cockpit" | "landscape" | "explore",
): T[] {
	const config = getLensConfig(lensId);
	if (!config.investigationOrder.length) return [...items];

	const order = config.investigationOrder;
	return [...items].sort((a, b) => {
		const ia = order.indexOf(a.id);
		const ib = order.indexOf(b.id);
		if (ia === -1 && ib === -1) return 0;
		if (ia === -1) return 1;
		if (ib === -1) return -1;
		return ia - ib;
	});
}

// ---------------------------------------------------------------------------
// Landscape-specific helper
// ---------------------------------------------------------------------------

/**
 * Maps a lens to the best available primary quadrant type for the Landscape
 * surface.  Landscape renders only `cycle_throughput` and `churn_throughput`,
 * so this function clamps any out-of-scope role primaryQuadrant to the
 * Landscape-safe default (`cycle_throughput`).
 */
export const getLandscapePrimaryType = (
	lensId: LensId,
): "cycle_throughput" | "churn_throughput" => {
	const config = getLensConfig(lensId);
	if (
		config.primaryQuadrant === "cycle_throughput" ||
		config.primaryQuadrant === "churn_throughput"
	) {
		return config.primaryQuadrant;
	}
	return "cycle_throughput";
};
