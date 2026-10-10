import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-9117 guard: no raw `${...}` in a path segment of an app-route path.
 *
 * A path template that starts with `/` and holds `${value}` before any `?` or `#` must wrap the
 * value in `encodeURIComponent(...)`, or be built with `appPath()` (src/lib/navigation/appPath.ts).
 * Why: a raw id with `:` `@` `=` `+` `&` `,` `;` `$` makes the Next.js 16.3.8 router prefetch the
 * link again without limit (CHAOS-9105); `/` opens another route and `%` is a malformed URL.
 *
 * Not checked: `/api/` paths and `revalidatePath(` (server paths, not links), test files, and
 * query-string values (they do not loop).
 *
 * Limits (the guard does not see these; review them by hand):
 * - a template that does not start with `/` (`${basePath}/x`, `new URL(`people/${id}`, origin)`);
 * - `[...].join("/")` and `"/people/[id]".replace("[id]", id)`;
 * - an app path behind an `/api/` prefix;
 * - a double encode: `/people/${encodeURIComponent(params.person_id)}` is accepted, but a route
 *   param is already encoded (see PARAM below);
 * - a path built in one place and used as an href in another (the guard reads the builder).
 * It does see string concatenation: `"/people/" + id` (a quoted path that ends in `/`, then `+`).
 *
 * To allow a template, add an entry to ALLOWED with a written reason. An entry that matches no
 * template fails the test, so the list cannot go stale.
 */
const SRC = join(process.cwd(), "src");

type Allowed = { file: string; template: string; reason: string };

/** The admin API client builds backend paths, not links. Its write paths are CHAOS-9117 part 2. */
const SKIPPED_DIRS = ["lib/admin/api/"];

const PARAM =
    "The value is the route param of this page, still encoded as the router gave it; appPath() would encode it twice.";
const QUERY_SUFFIX = "The expression is a query string (`?a=b`) or empty, not a path segment.";

const fromParam = (file: string, template: string): Allowed => ({
    file,
    template,
    reason: PARAM,
});
const CP = "app/(app)/org/admin/integrations/[provider]/customer-push/[source_id]";

const PROVIDER =
    "`provider` is the route param of the customer-push pages (or a prop given from it): a slug checked against the provider list. appPath() would encode it twice.";

const ALLOWED: Allowed[] = [
    {
        file: "app/(app)/agent-context/context-packet/page.tsx",
        template: "/superadmin/context-fabric/validation${suffix}",
        reason: QUERY_SUFFIX,
    },
    {
        file: "app/(app)/capacity/page.tsx",
        template: "/plan/capacity${suffix ? ",
        reason: QUERY_SUFFIX,
    },
    {
        file: "app/(app)/capacity-planning/page.tsx",
        template: "/plan/capacity${suffix ? ",
        reason: QUERY_SUFFIX,
    },
    {
        file: "app/(app)/plan/delivery-forecast/page.tsx",
        template: "/plan${suffix ? ",
        reason: QUERY_SUFFIX,
    },
    {
        file: "app/(app)/explore/landscape/page.tsx",
        template: "/landscape${bucket}",
        reason: "`bucket` is `?bucket=month` or empty (a query string).",
    },
    {
        file: "app/marketing/page.tsx",
        template: "/marketing/${buyer.slug}",
        reason: "`buyer.slug` is a fixed slug from the static buyer list in this file.",
    },
    {
        file: "lib/telemetry/routePatterns.ts",
        template: '/${normalized.join("/")}',
        reason: "Builds a route pattern label (`/people/[person_id]`) for telemetry, not a link.",
    },
    fromParam(
        `${CP}/batches/[ingestion_id]/page.tsx`,
        "/org/admin/integrations/${provider}/customer-push/${sourceId}",
    ),
    fromParam(
        `${CP}/batches/page.tsx`,
        "/org/admin/integrations/${provider}/customer-push/${sourceId}",
    ),
    fromParam(
        `${CP}/credentials/new/page.tsx`,
        "/org/admin/integrations/${provider}/customer-push/${sourceId}",
    ),
    fromParam(
        `${CP}/credentials/page.tsx`,
        "/org/admin/integrations/${provider}/customer-push/${sourceId}",
    ),
    fromParam(
        `${CP}/examples/page.tsx`,
        "/org/admin/integrations/${provider}/customer-push/${sourceId}",
    ),
    fromParam(
        `${CP}/validate/page.tsx`,
        "/org/admin/integrations/${provider}/customer-push/${sourceId}",
    ),
    fromParam(
        "app/(app)/org/admin/sync/[configId]/runs/[runId]/page.tsx",
        "/org/admin/sync/${configId}",
    ),
    fromParam(
        "app/(app)/people/[person_id]/metrics/[metric]/page.tsx",
        "/people/${personId}/metrics/${metric}",
    ),
    fromParam("app/(app)/people/[person_id]/metrics/[metric]/page.tsx", "/people/${personId}"),
    {
        file: "app/(app)/org/admin/integrations/[provider]/customer-push/new/page.tsx",
        template: "/org/admin/integrations/${provider}",
        reason: PROVIDER,
    },
    {
        file: `${CP}/page.tsx`,
        template: "/org/admin/integrations/${provider}",
        reason: PROVIDER,
    },
    {
        file: "components/admin/integrations/customer-push/ModeCards.tsx",
        template: "/org/admin/integrations/${provider}/customer-push/new",
        reason: PROVIDER,
    },
    {
        file: "components/admin/integrations/customer-push/CustomerPushSourceOverview.tsx",
        template:
            "/org/admin/integrations/${provider}/customer-push/${encodeURIComponent(source.id)}",
        reason: PROVIDER,
    },
    {
        file: "components/admin/integrations/customer-push/CreateCustomerPushSourceForm.tsx",
        template:
            "/org/admin/integrations/${provider}/customer-push/${encodeURIComponent(result.data.id)}",
        reason: PROVIDER,
    },
];

function sourceFiles(dir: string): string[] {
    const files: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (name === "__tests__" || name === "test" || name === "node_modules") continue;
            files.push(...sourceFiles(full));
        } else if (/\.(ts|tsx)$/u.test(name) && !/\.(test|spec|stories)\.tsx?$/u.test(name)) {
            files.push(full);
        }
    }
    return files;
}

/** The `${...}` expressions of a template (balanced braces) with the static text before each. */
function pathExpressions(template: string): string[] {
    const found: string[] = [];
    let before = "";
    for (let i = 0; i < template.length; i += 1) {
        if (template[i] === "$" && template[i + 1] === "{") {
            let depth = 1;
            let j = i + 2;
            for (; j < template.length && depth > 0; j += 1) {
                if (template[j] === "{") depth += 1;
                else if (template[j] === "}") depth -= 1;
            }
            const expression = template.slice(i + 2, j - 1).trim();
            if (/[?#]/u.test(before)) return found;
            found.push(expression);
            before += "x";
            i = j - 1;
        } else {
            before += template[i];
        }
    }
    return found;
}

/** Every backtick string that starts with `/` and has a raw expression in its path part. */
export function rawPathTemplates(source: string): string[] {
    const hits: string[] = [];
    const pattern = /`(\/(?:[^`\\]|\\.)*)`/gu;
    for (const match of source.matchAll(pattern)) {
        const template = match[1];
        if (template.startsWith("/api/")) continue;
        const line = source.slice(source.lastIndexOf("\n", match.index) + 1, match.index);
        if (/revalidatePath\(\s*$/u.test(line)) continue;
        const raw = pathExpressions(template).filter(
            (expression) => !/^encodeURIComponent\(/u.test(expression),
        );
        if (raw.length > 0) hits.push(template);
    }
    // String concatenation: a quoted path that ends in `/`, then `+`.
    for (const match of source.matchAll(/(["'])(\/[^"'\n]*\/)\1\s*\+/gu)) {
        if (!match[2].startsWith("/api/")) hits.push(`concat ${match[2]} +`);
    }
    return hits;
}

describe("raw ids in app-route paths (CHAOS-9117)", () => {
    it("finds a raw value and accepts an encoded one", () => {
        expect(rawPathTemplates("const a = `/people/${id}`;")).toEqual(["/people/${id}"]);
        expect(rawPathTemplates("const a = `/people/${encodeURIComponent(id)}`;")).toEqual([]);
        expect(rawPathTemplates("const a = `/explore?q=${q}`;")).toEqual([]);
        expect(rawPathTemplates("fetch(`/api/v1/teams/${id}`);")).toEqual([]);
        expect(rawPathTemplates("revalidatePath(`/org/admin/sync/${id}`);")).toEqual([]);
        expect(rawPathTemplates("const a = `${base}/x`;")).toEqual([]);
        expect(rawPathTemplates('const a = "/people/" + id;')).toEqual(["concat /people/ +"]);
        expect(rawPathTemplates("const a = '/prs/' + repoId + ':' + n;")).toEqual([
            "concat /prs/ +",
        ]);
        expect(rawPathTemplates('const a = "/explore?q=" + q;')).toEqual([]);
        expect(rawPathTemplates('fetch("/api/v1/x/" + id);')).toEqual([]);
        expect(rawPathTemplates("const a = `/x/${a}/${encodeURIComponent(b)}/${c}`;")).toEqual([
            "/x/${a}/${encodeURIComponent(b)}/${c}",
        ]);
    });

    it("has no raw ${...} in a path segment, except the allowed ones", () => {
        const found = new Set<string>();
        for (const file of sourceFiles(SRC)) {
            const name = relative(SRC, file).split("\\").join("/");
            if (SKIPPED_DIRS.some((dir) => name.startsWith(dir))) continue;
            for (const template of rawPathTemplates(readFileSync(file, "utf8"))) {
                found.add(`${name} :: ${template}`);
            }
        }
        const allowed = new Set(ALLOWED.map((entry) => `${entry.file} :: ${entry.template}`));
        expect(
            [...found].filter((entry) => !allowed.has(entry)),
            "wrap the value in appPath() / encodeURIComponent(), or add an ALLOWED entry with a reason",
        ).toEqual([]);
        expect(
            [...allowed].filter((entry) => !found.has(entry)),
            "stale ALLOWED entries",
        ).toEqual([]);
        for (const entry of ALLOWED) expect(entry.reason.trim().length).toBeGreaterThan(10);
    });
});
