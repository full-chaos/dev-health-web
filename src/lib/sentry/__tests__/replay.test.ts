import { describe, expect, it } from "vitest";

import {
	DEFAULT_REPLAY_ROUTE_PREFIXES,
	getReplayRoutePrefixes,
	shouldLoadReplayForPath,
} from "@/lib/sentry/replay";

describe("Sentry Replay route gating", () => {
	it("loads Replay on the moved org admin route by default", () => {
		expect(shouldLoadReplayForPath("/org/admin")).toBe(true);
		expect(shouldLoadReplayForPath("/org/admin/sync")).toBe(true);
	});

	it("keeps legacy admin and superadmin defaults", () => {
		expect(DEFAULT_REPLAY_ROUTE_PREFIXES).toContain("/admin");
		expect(shouldLoadReplayForPath("/admin/sync")).toBe(true);
		expect(shouldLoadReplayForPath("/superadmin/users")).toBe(true);
	});

	it("honors explicit comma-separated overrides", () => {
		expect(getReplayRoutePrefixes("/reports, /settings")).toEqual([
			"/reports",
			"/settings",
		]);
		expect(getReplayRoutePrefixes("")).toEqual([]);
	});
});
