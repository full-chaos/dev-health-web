import { describe, expect, it } from "vitest";

import { isCustomTeam } from "./customTeam";

describe("isCustomTeam", () => {
    it("accepts a team id with the custom: prefix", () => {
        expect(isCustomTeam("custom:4f2a")).toBe(true);
    });

    it.each([
        "platform",
        "gh:acme/platform",
        "gl:1234",
        "ms-teams:abcd",
        "jira:CHAOS",
        "customer:1",
    ])("rejects the synced team id %s", (id) => {
        expect(isCustomTeam(id)).toBe(false);
    });

    it.each(["", "Custom:4f2a", " custom:4f2a", "xcustom:4f2a", null, undefined])(
        "rejects the odd input %j",
        (id) => {
            expect(isCustomTeam(id)).toBe(false);
        },
    );
});
