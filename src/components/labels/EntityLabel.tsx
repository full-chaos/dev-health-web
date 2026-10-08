import { isProviderKeyedId } from "@/lib/labels/idToken";
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
 *   4. otherwise the label reads "Unresolved" (an ID is never the label or the tooltip)
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
    className?: string;
    "data-testid"?: string;
};

export function EntityLabel({
    id,
    displayName,
    name,
    nameMap,
    fallback,
    variant = "entity",
    className,
    "data-testid": testId,
}: EntityLabelProps) {
    const raw = typeof id === "string" ? id.trim() : "";
    const resolvedName = displayName?.trim() || name?.trim() || undefined;

    // Narrative guard (CHAOS-2064): backend-built prose can interpolate an
    // unresolved id directly into a sentence. Scrub embedded UUID/hash tokens to
    // stable short tokens so a raw id never renders inside a headline / title.
    // Prose with no id tokens (or an explicit display name) renders verbatim.
    if (variant === "text" && !resolvedName && raw && !isProviderKeyedId(raw)) {
        const scrubbed = scrubIdentifiers(raw);
        if (!scrubbed.changed) {
            return (
                <span className={className} data-testid={testId} data-resolved="true">
                    {raw}
                </span>
            );
        }
        return (
            <span className={className} data-testid={testId} data-resolved="false">
                {scrubbed.text}
            </span>
        );
    }

    const resolved = resolveEntityLabel(id, {
        name: resolvedName,
        nameMap,
        fallback,
    });

    if (resolved.resolved) {
        return (
            <span className={className} data-testid={testId} data-resolved="true">
                {resolved.label}
            </span>
        );
    }

    // Degraded: the label says "Unresolved"; the id is not shown.
    return (
        <span className={className} data-testid={testId} data-resolved="false">
            {resolved.label}
        </span>
    );
}
