/**
 * Builds the href for a repo drill-through page, preserving the current
 * security filter `f` query param when present so severity/date/search
 * narrowing survives the navigation.
 */
export function buildRepoHref(repoId: string, f?: string): string {
  const base = `/security/repos/${encodeURIComponent(repoId)}`;
  return f ? `${base}?f=${f}` : base;
}
