import { describe, expect, it } from "vitest";

import { chartEntityLabel, resolveEntityLabel } from "@/lib/labels/entityLabel";
import { containsIdToken, isProviderKeyedId } from "@/lib/labels/idToken";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

// Every provider prefix teamid.Of writes (CHAOS-8939), and a bare id as written before it.
const PREFIXED = [
    `jira:${UUID}`,
    "linear:ENG",
    "gh:full-chaos/platform",
    "gl:full-chaos/platform",
    "ms-teams:19:abc123",
];

describe("team id forms (CHAOS-8939)", () => {
    it.each(PREFIXED)("treats %s as a provider-keyed id", (id) => {
        expect(isProviderKeyedId(id)).toBe(true);
        expect(containsIdToken(id)).toBe(true);
    });

    it.each(PREFIXED)("never labels %s with the id", (id) => {
        expect(resolveEntityLabel(id)).toMatchObject({ label: "Unresolved", resolved: false });
        expect(chartEntityLabel(id)).toBe("Unresolved");
    });

    it.each(PREFIXED)("shows the served name for %s", (id) => {
        expect(chartEntityLabel(id, { nameMap: { [id]: "Platform" } })).toBe("Platform");
    });

    it("keeps a bare uuid team id Unresolved and a named bare id named", () => {
        expect(chartEntityLabel(UUID)).toBe("Unresolved");
        expect(chartEntityLabel(UUID, { nameMap: { [UUID]: "Platform" } })).toBe("Platform");
    });

    it("does not read a name that has a colon and a space as an id", () => {
        expect(isProviderKeyedId("Platform: Core")).toBe(false);
    });
});
