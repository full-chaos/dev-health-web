/**
 * Single source of truth for "is this feature a preview / not-yet-general
 * destination". Centralizing this lets navigation (PrimaryNav), page headers
 * (AIPageHeader / AdminHeader), and feature surfaces agree on one answer
 * instead of each re-deciding via scattered copy or ad-hoc flags.
 *
 * A preview feature is one whose underlying signal is not yet generally
 * available (e.g. detector-gated AI surfaces). It is NOT deleted — it stays
 * reachable but is clearly marked so it never looks like a plain, broken
 * destination.
 *
 * Keys are stable nav-item ids (see `PrimaryNav` `navGroups[].items[].id`) so a
 * consumer can ask `isPreviewFeature(item.id)` while rendering the nav.
 */

export type PreviewFeatureId = "ai-opportunities";

/**
 * Registry of features currently in preview. Add an entry here (and only here)
 * to mark a destination as preview across nav + headers.
 */
export const PREVIEW_FEATURES: Record<PreviewFeatureId, { label: string }> = {
  // /ai/automations — best-fit automation candidates depend on the
  // recommendation detector, which is not yet generally available.
  "ai-opportunities": { label: "Automation candidates" },
};

/** True when `id` names a feature that should be marked as preview. */
export function isPreviewFeature(id: string): id is PreviewFeatureId {
  return Object.prototype.hasOwnProperty.call(PREVIEW_FEATURES, id);
}
