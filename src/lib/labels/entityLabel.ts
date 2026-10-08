import { isProviderKeyedId } from "@/lib/labels/idToken";
import { UNRESOLVED } from "@/lib/labels/unresolved";

/**
 * Render-safe entity label resolution.
 *
 * Resolves repo / org / team / service / user / file identifiers — UUIDs,
 * prefixed ids like `repo:web-app`, and path-like ids like `org/web-app` —
 * into human-readable labels. When a real name cannot be resolved, the label
 * says "Unresolved"; the identifier is shown nowhere (not in the tooltip either).
 * It NEVER returns an ID (UUID, UUID prefix, short token, hash) as the label.
 *
 * Shared across charts and lists so every surface renders entities the
 * same way. Prefer passing an explicit `name` (e.g. `repoName` carried on
 * the data) or a `nameMap` when one is available — the helper only falls
 * back to degradation when no name can be found.
 */

/** Result of resolving a single entity identifier. */
export interface EntityLabel {
    /** Render-safe display label. Never an ID token. */
    label: string;
    /** Tooltip text. Equals `label`: an id never reaches a tooltip. */
    title: string;
    /**
     * True when `label` is a confident human-readable name — an explicit
     * `name`, a `nameMap` hit, or an already human-readable slug/segment.
     * False only for degraded (UUID-derived) labels and the empty fallback,
     * which is the signal that a tooltip should be surfaced.
     */
    resolved: boolean;
}

/** Options controlling how a single identifier is resolved. */
export interface ResolveEntityLabelOptions {
    /** Explicit human-readable name (e.g. `repoName` carried on data). Preferred. */
    name?: string | null;
    /** `id` → name lookup map for batch resolution. */
    nameMap?: Record<string, string>;
    /** Label used when `id` is empty / missing. Defaults to `"Unknown"`. */
    fallback?: string;
    /** Label used when `id` is an ID with no name. Defaults to `"Unresolved"`. */
    unresolvedFallback?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX32_RE = /^[0-9a-f]{32}$/i;
const KNOWN_PREFIXES = ["repo:", "org:", "team:", "service:", "user:", "author:", "file:"] as const;

function stripPrefix(id: string): { prefix: string; rest: string } {
    const lower = id.toLowerCase();
    for (const p of KNOWN_PREFIXES) {
        if (lower.startsWith(p)) {
            return { prefix: p.slice(0, -1), rest: id.slice(p.length) };
        }
    }
    return { prefix: "", rest: id };
}

/** Last non-empty `/`- or `\`-delimited segment of a path-like id. */
function lastSegment(s: string): string {
    const parts = s.split(/[/\\]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : s;
}

function isUuidLike(s: string): boolean {
    return UUID_RE.test(s) || HEX32_RE.test(s);
}

/**
 * Resolve a single entity identifier into a render-safe label.
 *
 * Resolution order:
 *   1. Empty / missing id  → `fallback`.
 *   2. Explicit `name`     → resolved (preferred).
 *   3. `nameMap[id]` hit   → resolved.
 *   4. Strip known prefix, take last path segment.
 *   5. UUID-like segment   → "Unresolved" label + id in the tooltip.
 *   6. Readable slug       → use as-is (human-readable).
 */
export function resolveEntityLabel(
    id: string | null | undefined,
    options: ResolveEntityLabelOptions = {},
): EntityLabel {
    const { name, nameMap, fallback = "Unknown", unresolvedFallback } = options;
    const raw = typeof id === "string" ? id.trim() : "";

    // 1. Empty / missing id.
    if (!raw) {
        return { label: fallback, title: fallback, resolved: false };
    }

    // 2. Explicit name wins (prefer repoName carried on data).
    if (name && name.trim()) {
        return { label: name.trim(), title: name.trim(), resolved: true };
    }

    // 3. Map lookup.
    const mapped = nameMap?.[raw];
    if (mapped && mapped.trim()) {
        return { label: mapped.trim(), title: mapped.trim(), resolved: true };
    }

    // Provider-keyed ids (jira:<uuid>, gh:<slug>, linear:<id>) are ids whatever follows the prefix.
    if (isProviderKeyedId(raw)) {
        const label = unresolvedFallback ?? UNRESOLVED;
        return { label, title: label, resolved: false };
    }

    // 4. Strip a known entity prefix (repo:, org:, …) and take the last
    //    path segment for path-like ids.
    const { rest } = stripPrefix(raw);
    const segment = lastSegment(rest);

    // 5. UUID (with or without prefix / path) → the label says so; the full id
    //    stays in the tooltip. An ID is never the label.
    if (isUuidLike(segment)) {
        const label = unresolvedFallback ?? UNRESOLVED;
        return { label, title: label, resolved: false };
    }

    // 6. Human-readable slug / segment.
    if (segment) {
        return { label: segment, title: segment, resolved: true };
    }

    // Absolute fallback — never an ID.
    return { label: fallback, title: fallback, resolved: false };
}

/**
 * Batch-resolve a list of identifiers, returning column-aligned `labels`
 * and `titles` arrays (ideal for chart axes) plus the full `results`.
 *
 * `options` may be a single options object applied to every id, or a
 * function `(id, index) => options` for per-item names / maps.
 */
export function resolveEntityLabels(
    ids: ReadonlyArray<string | null | undefined>,
    options:
        ResolveEntityLabelOptions | ((id: string, index: number) => ResolveEntityLabelOptions) = {},
): { labels: string[]; titles: string[]; results: EntityLabel[] } {
    const results = ids.map((id, i) => {
        const opts = typeof options === "function" ? options(id ?? "", i) : options;
        return resolveEntityLabel(id, opts);
    });
    return {
        labels: results.map((r) => r.label),
        titles: results.map((r) => r.title),
        results,
    };
}

/**
 * Resolve a single identifier for a NON-React surface — ECharts tooltip /
 * axis / node label strings, where the JSX `EntityLabel` component cannot be
 * used. Returns a human label when one resolves, otherwise "Unresolved". It
 * NEVER returns an ID, so chart labels degrade identically to cards and tables.
 */
export function chartEntityLabel(
    id: string | null | undefined,
    options: ResolveEntityLabelOptions = {},
): string {
    return resolveEntityLabel(id, options).label;
}

// Embedded-identifier scrubbing (CHAOS-2064). Backend-built narrative strings
// (cockpit headlines, signal titles) can interpolate an *unresolved* scope id
// directly into prose, e.g. "Compounding risk appears elevated for <uuid>".
// `scrubIdentifiers` replaces each embedded UUID / 32-char hex token with
// "an unresolved item" so an ID never renders inside narrative.
const UNRESOLVED_ITEM = "an unresolved item";
const EMBEDDED_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMBEDDED_HEX32_RE = /\b[0-9a-f]{32}\b/gi;

/**
 * Replace embedded UUID / long-hash tokens inside a narrative string with
 * "an unresolved item". Returns the scrubbed text and whether anything changed.
 * Resolved prose with no id tokens is returned untouched (`changed: false`).
 */
export function scrubIdentifiers(text: string | null | undefined): {
    text: string;
    changed: boolean;
} {
    const raw = typeof text === "string" ? text : "";
    if (!raw) return { text: raw, changed: false };
    let changed = false;
    let out = raw.replace(EMBEDDED_UUID_RE, () => {
        changed = true;
        return UNRESOLVED_ITEM;
    });
    out = out.replace(EMBEDDED_HEX32_RE, () => {
        changed = true;
        return UNRESOLVED_ITEM;
    });
    return { text: out, changed };
}
