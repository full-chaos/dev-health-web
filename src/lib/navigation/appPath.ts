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
