const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_OR_HEX_ID_RE = /^(?:\d{4,}|[0-9a-f]{16,})$/i;

// Most specific first. A route matches when the path starts with every segment of its template;
// `[x]` matches any one segment. A static sibling of a dynamic route is listed before it.
export const ROUTE_TEMPLATES: readonly string[] = [
    "/people/[person_id]/metrics/[metric]",
    "/people/[person_id]",
    "/reports/new",
    "/reports/[id]",
    "/prs/[pr_id]",
    "/issues/[issue_id]",
    "/deployments/[deployment_id]",
    "/security/repos/[repoId]",
    "/org/admin/integrations/[provider]/customer-push/[source_id]/batches/[ingestion_id]",
    "/org/admin/integrations/[provider]/customer-push/[source_id]",
    "/org/admin/integrations/[provider]",
    "/org/admin/sync/new",
    "/org/admin/sync/[configId]/runs/[runId]",
    "/org/admin/sync/[configId]",
    "/org/admin/identities/new",
    "/org/admin/identities/[id]",
    "/org/admin/teams/new",
    "/org/admin/teams/[id]",
    "/org/admin/users/new",
    "/org/admin/users/[id]",
    "/superadmin/orgs/new",
    "/superadmin/orgs/[id]",
    "/superadmin/licensing/[orgId]",
    "/superadmin/product-telemetry/[orgId]",
    "/superadmin/users/new",
    "/superadmin/users/[id]",
    "/api/agent-context/evidence/[evidenceRefId]",
];

const COMPILED = ROUTE_TEMPLATES.map((template) => ({
    template,
    segments: template.split("/").filter(Boolean),
}));

function matches(parts: string[], segments: string[]): boolean {
    if (parts.length < segments.length) return false;
    return segments.every((segment, i) => segment.startsWith("[") || segment === parts[i]);
}

export function routePatternForPathname(input: string): string {
    const pathname = input.split("?")[0].split("#")[0] || "/";
    const parts = pathname.split("/").filter(Boolean);

    for (const { template, segments } of COMPILED) {
        if (matches(parts, segments)) return template;
    }

    const normalized = parts.map((part) =>
        UUID_RE.test(part) || NUMERIC_OR_HEX_ID_RE.test(part) ? "[id]" : part,
    );
    return `/${normalized.join("/")}`;
}
