import { describe, expect, it } from "vitest";

import { appHref, appPath } from "../appPath";

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

/**
 * CHAOS-9209. A link whose query holds a raw value (`/code?file=api/server.go`, a served
 * evidence URL) made the Next.js 16.3.8 router drop the prefetch response with its body not read
 * and not cancelled: the router compares the search of the response URL, written again by
 * `URLSearchParams` (`%2F`), with the raw search of the href. `appHref` writes the query in the
 * `URLSearchParams` form, so the two are the same.
 */
describe("appHref", () => {
    it.each([
        ["/code?file=api/server.go", "/code?file=api%2Fserver.go"],
        ["/code?file=src/app:a.py", "/code?file=src%2Fapp%3Aa.py"],
        ["/code?file=docs/my file.md", "/code?file=docs%2Fmy+file.md"],
        ["/code?file=docs/my%20file.md", "/code?file=docs%2Fmy+file.md"],
        ["/code?file=a.go&repo=org/ops", "/code?file=a.go&repo=org%2Fops"],
        ["/code?file=50%/a.go", "/code?file=50%25%2Fa.go"],
        ["/code?file=a/b.go#L10", "/code?file=a%2Fb.go#L10"],
    ])("writes the query of %j in the URLSearchParams form", (href, canonical) => {
        expect(appHref(href)).toBe(canonical);
    });

    it("gives the search that the router reads back from the response URL", () => {
        // What Next.js does to the response URL before the compare (urlToUrlWithoutFlightMarker).
        const href = appHref("/code?file=src/app:a b.py");
        const response = new URL(`${href}&_rsc=abc12`, "http://localhost");
        response.searchParams.delete("_rsc");
        expect(new URL(href, "http://localhost").search).toBe(response.search);
    });

    it("does not change a canonical href (safe to apply two times)", () => {
        const once = appHref("/code?file=src/app:a b.py");
        expect(appHref(once)).toBe(once);
    });

    it.each(["/code", "/code#top", "/explore?metric=churn", "/code?file=a.go"])(
        "keeps %j, which is canonical",
        (href) => {
            expect(appHref(href)).toBe(href);
        },
    );

    it.each(["https://example.com/a?file=a/b", "//example.com/a?file=a/b", "#", "mailto:a@b.c"])(
        "keeps %j, which is not an app path",
        (href) => {
            expect(appHref(href)).toBe(href);
        },
    );
});
