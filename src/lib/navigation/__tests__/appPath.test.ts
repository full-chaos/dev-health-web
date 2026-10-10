import { describe, expect, it } from "vitest";

import { appPath } from "../appPath";

/**
 * CHAOS-9105. A link with a raw id in its path made the router request the same route without
 * end (Next.js 16.3.8, prefetch of a link in view): the server gives the route tree with the
 * dynamic segment in `encodeURIComponent` form, and from the fifth link of a route the client
 * builds that segment from the href. `appPath` writes the segment in the server's form.
 */
describe("appPath", () => {
    it.each([
        ["custom:alpha", "custom%3Aalpha"],
        [
            "jira:8012df0c-1a2b-4c3d-9e4f-000000000001",
            "jira%3A8012df0c-1a2b-4c3d-9e4f-000000000001",
        ],
        ["R&D", "R%26D"],
        ["a/b", "a%2Fb"],
        ["50%", "50%25"],
        ["person+ops@example.com", "person%2Bops%40example.com"],
        ["name with space", "name%20with%20space"],
        ["a=b,c;d$e", "a%3Db%2Cc%3Bd%24e"],
        ["a?b#c", "a%3Fb%23c"],
        ["plain-team_1.x", "plain-team_1.x"],
    ])("encodes the dynamic segment %j", (id, encoded) => {
        expect(appPath("/org/admin/teams/[id]/edit", { id })).toBe(
            `/org/admin/teams/${encoded}/edit`,
        );
    });

    it("gives back the id when the browser decodes the segment", () => {
        for (const id of ["custom:alpha", "R&D", "a/b", "50%", "person+ops@example.com"]) {
            const segment = appPath("/org/admin/teams/[id]/edit", { id }).split("/")[4];
            expect(decodeURIComponent(segment)).toBe(id);
        }
    });

    it("keeps one path segment for one dynamic segment", () => {
        expect(appPath("/org/admin/teams/[id]/edit", { id: "a/b" }).split("/")).toHaveLength(6);
    });

    it("fills each placeholder of the template", () => {
        expect(
            appPath(
                "/org/admin/integrations/[provider]/customer-push/[source_id]/batches/[ingestion_id]",
                { provider: "github", source_id: "src:1", ingestion_id: "ing/2" },
            ),
        ).toBe("/org/admin/integrations/github/customer-push/src%3A1/batches/ing%2F2");
    });

    it("leaves a template with no placeholder as it is", () => {
        expect(appPath("/org/admin/teams", {})).toBe("/org/admin/teams");
    });

    it("throws when a segment value is missing at run time", () => {
        const params = {} as { id: string };
        expect(() => appPath("/org/admin/teams/[id]/edit", params)).toThrow(/id/u);
    });
});
