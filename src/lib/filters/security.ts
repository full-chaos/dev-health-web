const toBase64Url = (value: string): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf-8").toString("base64url");
  }
  const encoded = btoa(unescape(encodeURIComponent(value)));
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64url").toString("utf-8");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  return decodeURIComponent(escape(atob(padded)));
};

const stableStringify = (input: unknown): string => {
  if (Array.isArray(input)) {
    return `[${input.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(input);
};

// Allowed field keys for forward-compat filtering
const ALLOWED_KEYS = new Set([
  "severities",
  "sources",
  "states",
  "repoIds",
  "since",
  "until",
  "openOnly",
  "search",
]);

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "unknown";
export type SecuritySource =
  | "dependabot"
  | "code_scanning"
  | "advisory"
  | "gitlab_vulnerability"
  | "gitlab_dependency";
export type SecurityState =
  | "open"
  | "fixed"
  | "dismissed"
  | "detected"
  | "confirmed"
  | "resolved";

export type SecurityFilter = {
  severities?: SecuritySeverity[];
  sources?: SecuritySource[];
  states?: SecurityState[];
  repoIds?: string[];
  since?: string; // ISO date
  until?: string; // ISO date
  openOnly?: boolean;
  search?: string;
};

export function defaultSecurityFilter(): SecurityFilter {
  return { openOnly: true };
}

export function encodeSecurityFilter(f: SecurityFilter): string {
  const serialized = stableStringify(f);
  return toBase64Url(serialized);
}

export function decodeSecurityFilter(encoded: string | undefined): SecurityFilter {
  if (!encoded) {
    return defaultSecurityFilter();
  }
  try {
    const decoded = fromBase64Url(encoded);
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    // Drop unknown keys for forward-compat
    const safe: Record<string, unknown> = {};
    for (const key of Object.keys(parsed)) {
      if (ALLOWED_KEYS.has(key)) {
        safe[key] = parsed[key];
      }
    }
    // If no known keys survived (e.g. a foreign MetricFilter payload carried
    // over by PrimaryNav), treat the param as absent and return the default
    // so openOnly:true is not silently lost.
    if (Object.keys(safe).length === 0) {
      return defaultSecurityFilter();
    }
    return safe as SecurityFilter;
  } catch {
    return defaultSecurityFilter();
  }
}

/**
 * Returns a new filter with `repoIds` locked to the given single repo.
 * Used by the evidence page to scope the queue without polluting URL state.
 */
export function applyLockedRepoId(filter: SecurityFilter, repoId: string): SecurityFilter {
  return { ...filter, repoIds: [repoId] };
}
