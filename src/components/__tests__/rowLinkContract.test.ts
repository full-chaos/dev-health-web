import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-9105: the contract of a per-row link to a dynamic route, for each list table.
 *
 * 1. The href is built by `appPath` (each dynamic segment encoded), or by a helper named in
 *    `ENCODING_HELPERS` that encodes the id. A raw `${id}` in the href is not allowed.
 * 2. The link has `prefetch={false}`: a list must not send one request for each row in view.
 *
 * Why: on 2026-10-10 an idle `/org/admin/teams` with 13 teams sent about 100 requests per second
 * to production. The ids were `jira:<uuid>`; the href held them raw.
 *
 * A `<Link>` with a fixed string href (`href="/org/admin/teams/new"`) is not a row link and is
 * not checked.
 */
const SRC = join(process.cwd(), "src");

/** Helpers that build a path and encode the id. */
const ENCODING_HELPERS = ["appPath(", "syncConfigHref(", "reportHref("];

/** Each list file, with the number of dynamic links it must have (so a link cannot go unseen). */
const ROW_LINK_FILES: Record<string, number> = {
    "components/admin/teams/TeamTable.tsx": 2,
    "components/admin/identities/IdentityTable.tsx": 3,
    "components/admin/users/UserTable.tsx": 2,
    "components/admin/integrations/ProviderTable.tsx": 2,
    "components/admin/integrations/customer-push/CustomerPushSourceList.tsx": 3,
    "components/admin/integrations/customer-push/CustomerPushBatchList.tsx": 3,
    "components/admin/sync/SyncConfigTableRow.tsx": 2,
    "components/reports/ReportsTable.tsx": 2,
    "components/superadmin/OrgTable.tsx": 2,
    "components/superadmin/UserTable.tsx": 2,
    "components/superadmin/LicenseTable.tsx": 2,
};

/** Links to a path with no row id: the "new" form of a provider. They stay prefetched. */
const NOT_ROW_LINKS = ["/customer-push/new"];

/**
 * Links whose href is a prop of the list (one link above the table, not one for each row). The
 * page that builds the value owns its encoding; this scan cannot see it.
 */
const HREF_FROM_PROP = ["href={validateHref}", "href={examplesHref}"];

/** The text of each `<Link ...>` opening tag: up to the first `>` outside `{...}`. */
function linkOpeningTags(source: string): string[] {
    const tags: string[] = [];
    let from = 0;
    for (;;) {
        const start = source.indexOf("<Link", from);
        if (start === -1) return tags;
        const next = source[start + 5];
        if (next !== " " && next !== "\n" && next !== "\r" && next !== "\t") {
            from = start + 5;
            continue;
        }
        let depth = 0;
        let end = start;
        for (; end < source.length; end += 1) {
            const char = source[end];
            if (char === "{") depth += 1;
            else if (char === "}") depth -= 1;
            else if (char === ">" && depth === 0) break;
        }
        tags.push(source.slice(start, end + 1));
        from = end + 1;
    }
}

function isDynamic(tag: string): boolean {
    return /\bhref=\{/u.test(tag);
}

describe("per-row links to dynamic routes (CHAOS-9105)", () => {
    it("reads a tag to its end, past `>` inside an expression", () => {
        expect(
            linkOpeningTags('<Link href={a > b ? "/x" : "/y"} prefetch={false}>t</Link><Linked />'),
        ).toEqual(['<Link href={a > b ? "/x" : "/y"} prefetch={false}>']);
    });

    describe.each(Object.entries(ROW_LINK_FILES))("%s", (file, expectedCount) => {
        const dynamicLinks = linkOpeningTags(readFileSync(join(SRC, file), "utf8")).filter(
            isDynamic,
        );
        const builtHere = dynamicLinks.filter(
            (tag) => !HREF_FROM_PROP.some((marker) => tag.includes(marker)),
        );
        const rowLinks = builtHere.filter(
            (tag) => !NOT_ROW_LINKS.some((marker) => tag.includes(marker)),
        );

        it(`has ${expectedCount} links with a dynamic href`, () => {
            expect(dynamicLinks).toHaveLength(expectedCount);
        });

        it("builds each dynamic href with an encoding helper, never a raw template", () => {
            for (const tag of builtHere) {
                const href = /\bhref=\{([\s\S]*?)\}\s*(?:\n|\w+=|>)/u.exec(tag)?.[1] ?? tag;
                expect(
                    ENCODING_HELPERS.some((helper) => href.includes(helper)),
                    `href without an encoding helper: ${tag}`,
                ).toBe(true);
                expect(href.startsWith("`"), `raw template href: ${tag}`).toBe(false);
            }
        });

        it("turns prefetch off on each row link", () => {
            expect(rowLinks.length).toBeGreaterThan(0);
            for (const tag of rowLinks) {
                expect(tag, `row link with prefetch on: ${tag}`).toContain("prefetch={false}");
            }
        });
    });
});
