export const DEFAULT_REPLAY_ROUTE_PREFIXES = [
	"/org/admin",
	"/admin",
	"/superadmin",
] as const;

export function getReplayRoutePrefixes(
	raw: string | undefined,
): readonly string[] {
	if (raw === undefined) return DEFAULT_REPLAY_ROUTE_PREFIXES;
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export function shouldLoadReplayForPath(
	path: string,
	prefixes: readonly string[] = DEFAULT_REPLAY_ROUTE_PREFIXES,
): boolean {
	if (prefixes.length === 0) return false;
	return prefixes.some(
		(prefix) => path === prefix || path.startsWith(`${prefix}/`),
	);
}
