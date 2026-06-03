/**
 * Render-safe entity label resolution.
 *
 * Resolves repo / org / team / service / user / file identifiers — UUIDs,
 * prefixed ids like `repo:web-app`, and path-like ids like `org/web-app` —
 * into human-readable labels. When a real name cannot be resolved, it
 * degrades gracefully to a *stable* short label plus a full-identifier
 * tooltip (`title`). It NEVER returns a bare UUID as the primary label.
 *
 * Shared across charts and lists so every surface renders entities the
 * same way. Prefer passing an explicit `name` (e.g. `repoName` carried on
 * the data) or a `nameMap` when one is available — the helper only falls
 * back to degradation when no name can be found.
 */

/** Result of resolving a single entity identifier. */
export interface EntityLabel {
  /** Render-safe display label. Never a bare UUID. */
  label: string;
  /** Full identifier for tooltip / `title` attribute (traceability). */
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

/** First 8 hex chars of a UUID — stable, deterministic, human-distinguishable. */
function shortUuid(s: string): string {
  return s.replace(/-/g, "").slice(0, 8);
}

function assertUnresolvedFallback(id: string, fallback?: string): void {
  if (process.env.NODE_ENV !== "development") return;
  if (fallback === "Unresolved") return;
  throw new Error(
    `EntityLabel received unresolved id '${id}' without displayName/nameMap or unresolvedFallback: "Unresolved".`,
  );
}

/**
 * Resolve a single entity identifier into a render-safe label.
 *
 * Resolution order:
 *   1. Empty / missing id  → `fallback`.
 *   2. Explicit `name`     → resolved (preferred).
 *   3. `nameMap[id]` hit   → resolved.
 *   4. Strip known prefix, take last path segment.
 *   5. UUID-like segment   → degrade to stable short label + tooltip.
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
    return { label: name.trim(), title: raw, resolved: true };
  }

  // 3. Map lookup.
  const mapped = nameMap?.[raw];
  if (mapped && mapped.trim()) {
    return { label: mapped.trim(), title: raw, resolved: true };
  }

  // 4. Strip a known entity prefix (repo:, org:, …) and take the last
  //    path segment for path-like ids.
  const { prefix, rest } = stripPrefix(raw);
  const segment = lastSegment(rest);

  // 5. UUID (with or without prefix / path) → degrade to a stable short
  //    label, keeping the full id available as a tooltip. Never bare UUID.
  if (isUuidLike(segment)) {
    assertUnresolvedFallback(raw, unresolvedFallback);
    if (unresolvedFallback) {
      return { label: unresolvedFallback, title: raw, resolved: false };
    }
    const short = shortUuid(segment);
    const label = prefix ? `${prefix}·${short}` : `#${short}`;
    return { label, title: raw, resolved: false };
  }

  // 6. Human-readable slug / segment.
  if (segment) {
    return { label: segment, title: raw, resolved: true };
  }

  // Absolute fallback — never a bare UUID.
  return { label: fallback, title: raw, resolved: false };
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
    | ResolveEntityLabelOptions
    | ((id: string, index: number) => ResolveEntityLabelOptions) = {},
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
