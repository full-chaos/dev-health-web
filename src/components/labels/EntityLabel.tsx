import {
    resolveEntityLabel,
    scrubIdentifiers,
    type ResolveEntityLabelOptions,
} from "@/lib/labels/entityLabel";

/**
 * Canonical render-safe entity primitive (Framework A7, Part E).
 *
 * Renders a human-readable label for any repo / org / team / service / user /
 * scope / subject identifier and GUARANTEES a raw UUID or hash is never shown
 * as a primary label. The A7 fallback order is:
 *
 *   1. server-resolved display name (`displayName`) — preferred
 *   2. an explicit client `name` / `nameMap` hit
 *   3. a repo/name slug or path segment (e.g. `org/web-app` → `web-app`)
 *   4. a provider key with prefix (e.g. `repo:…` → `repo·a1b2c3d4`)
 *   5. a shortened, stable id token + an explicit "Unresolved" badge
 *
 * Reuse this everywhere an entity is surfaced so every cockpit, chart, and list
 * degrades identically. Pure + hook-free, so it is safe in both Server and
 * Client Components.
 *
 * `variant`:
 *   - "entity" (default): always resolve `id` as an identifier — for scope /
 *     subject chips where the value is a single token or path-like id.
 *   - "text": narrative-safe guard for headline / title strings. Multi-word
 *     prose is rendered verbatim; only a value that is a *bare* identifier
 *     (a lone UUID/hash token) is degraded. This prevents mangling sentences
 *     that legitimately contain "/" (e.g. "CI/CD is slowing down").
 */
type EntityLabelProps = {
    /** Raw identifier (UUID, `repo:web-app`, `org/web-app`, …) or narrative string. */
    id?: string | null;
    /** Server-resolved human display name. Preferred — wins over all degradation. */
    displayName?: string | null;
    /** Explicit client-side name (alias of `displayName`, lower precedence). */
    name?: string | null;
    /** `id` → name lookup map for batch-resolved surfaces. */
    nameMap?: ResolveEntityLabelOptions["nameMap"];
    /** Label used when `id` is empty / missing. Defaults to `"Unknown"`. */
    fallback?: string;
    variant?: "entity" | "text";
    /** Show the explicit "Unresolved" badge on degraded labels. Defaults to true. */
    showUnresolvedBadge?: boolean;
    className?: string;
    "data-testid"?: string;
};

const BADGE_CLASS =
    "rounded-full border border-(--border) bg-(--card-70) px-1.5 py-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-(--ink-muted)";

export function EntityLabel({
    id,
    displayName,
    name,
    nameMap,
    fallback,
    variant = "entity",
    showUnresolvedBadge = true,
    className,
    "data-testid": testId,
}: EntityLabelProps) {
    const raw = typeof id === "string" ? id.trim() : "";
    const resolvedName = displayName?.trim() || name?.trim() || undefined;

    // Narrative guard (CHAOS-2064): backend-built prose can interpolate an
    // unresolved id directly into a sentence. Scrub embedded UUID/hash tokens to
    // stable short tokens so a raw id never renders inside a headline / title.
    // Prose with no id tokens (or an explicit display name) renders verbatim.
    if (variant === "text" && !resolvedName && raw) {
        const scrubbed = scrubIdentifiers(raw);
        if (!scrubbed.changed) {
            return (
                <span className={className} data-testid={testId} data-resolved="true">
                    {raw}
                </span>
            );
        }
        return (
            <span className={className} title={raw} data-testid={testId} data-resolved="false">
                {scrubbed.text}
                {showUnresolvedBadge ? (
                    <span className={`ml-1.5 align-middle ${BADGE_CLASS}`}>Unresolved</span>
                ) : null}
            </span>
        );
    }

    const resolved = resolveEntityLabel(id, {
        name: resolvedName,
        nameMap,
        fallback,
        // Opt into the canonical guardrail: degraded ids carry an explicit
        // "Unresolved" affordance rather than leaking a bare UUID.
        unresolvedFallback: "Unresolved",
    });

    if (resolved.resolved) {
        return (
            <span
                className={className}
                title={resolved.title}
                data-testid={testId}
                data-resolved="true"
            >
                {resolved.label}
            </span>
        );
    }

    // Degraded: render the stable short token + an explicit Unresolved badge.
    const shortToken = resolved.short ?? resolved.label;
    return (
        <span
            className={className}
            title={resolved.title}
            data-testid={testId}
            data-resolved="false"
        >
            <span className="font-mono">{shortToken}</span>
            {showUnresolvedBadge ? (
                <span className={`ml-1.5 align-middle ${BADGE_CLASS}`}>Unresolved</span>
            ) : null}
        </span>
    );
}
