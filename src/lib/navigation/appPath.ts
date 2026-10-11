/**
 * The path of an app route with dynamic segments, each segment encoded (CHAOS-9105).
 *
 * `appPath("/org/admin/teams/[id]/edit", { id: team.team_id })` gives
 * `/org/admin/teams/jira%3A<uuid>/edit`. The template is the route as its folders spell it.
 *
 * Why every link to a dynamic route goes through this: an id is data (`jira:<uuid>`,
 * `custom:<slug>`, an e-mail address, a name with `&` or `/`). Written raw into an href:
 * - `/` adds a path segment, so the link opens another route (404), and `%` is a malformed URL;
 * - `:` `@` `=` `+` `&` `,` `;` `$` stay in the path, but the server gives the route tree with the
 *   segment in `encodeURIComponent` form. The Next.js 16.3.8 router compares that with the
 *   segment it built from the href, finds them different, and prefetches the link again at once,
 *   with no limit: one list page in view sent about 100 requests per second to production.
 *
 * The page of the route gets the segment as the router gives it (still encoded) and passes it to
 * the backend call unchanged; the backend decodes it once. Do not decode it in between.
 */
type SegmentNames<Template extends string> =
    Template extends `${string}[${infer Name}]${infer Rest}` ? Name | SegmentNames<Rest> : never;

export function appPath<Template extends string>(
    template: Template,
    segments: Record<SegmentNames<Template>, string>,
): string {
    const values: Record<string, string | undefined> = segments;
    return template.replace(/\[([^\]]+)\]/gu, (_placeholder, name: string) => {
        const value = values[name];
        if (typeof value !== "string") {
            throw new Error(`appPath: no value for the segment [${name}] of ${template}`);
        }
        return encodeURIComponent(value);
    });
}

/**
 * An in-app href with its query in the `URLSearchParams` form (CHAOS-9209).
 *
 * `appHref("/code?file=api/server.go")` gives `/code?file=api%2Fserver.go`. Use it for every
 * in-app href that is not built here: a URL the API served (`evidenceUrl`), or a href with a
 * value in its query. The path and the hash stay as they are; a href that is not an app path
 * (`https://...`, `//host`, `#`, `mailto:`) stays as it is.
 *
 * Why: a value in a query is data (a file path with `/`, an id with `:`, a name with a space).
 * The Next.js 16.3.8 router prefetches a link to the page it is on (`/code?file=...` on `/code`)
 * with a route it builds from the href, and keeps the RAW search of the href. It then reads the
 * search of the response URL after `searchParams.delete("_rsc")`, which writes the query again
 * (`/` to `%2F`, `:` to `%3A`, a space to `+`). The two are different, so the router drops the
 * response with its body not read and not cancelled: the prefetch is lost and the request has
 * no end in the browser (a page that never comes to "network idle").
 */
export function appHref(href: string): string {
    if (!href.startsWith("/") || href.startsWith("//")) return href;
    const hashAt = href.indexOf("#");
    const hash = hashAt === -1 ? "" : href.slice(hashAt);
    const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
    const queryAt = beforeHash.indexOf("?");
    if (queryAt === -1) return href;
    const query = new URLSearchParams(beforeHash.slice(queryAt + 1)).toString();
    return `${beforeHash.slice(0, queryAt)}${query ? `?${query}` : ""}${hash}`;
}
