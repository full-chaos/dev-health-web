// Platform action table and impersonation rule table for the web UI. Pure data:
// no I/O, no behavior change. Parity cells read the pinned ops catalog
// (src/lib/auth/platform/__tests__/testdata/ops-actions.v1.json, ops 2f0f26bed).

export const PLATFORM_ACTIONS = [
    "admin.users",
    "admin.orgs",
    "admin.impersonate",
    "admin.billing",
    "admin.flags",
    "admin.audit",
    "admin.telemetry",
    "admin.stats",
    "authz.decide",
    "credentials.project",
] as const;
export type PlatformAction = (typeof PLATFORM_ACTIONS)[number];

// Organization actions the catalog denies to a delegated (impersonation) session.
export const ORG_IMPERSONATION_DENIED_ACTIONS = [
    "settings.write",
    "reports.write",
    "integrations.write",
    "members.invite",
    "members.manage",
    "members.update",
    "org.write",
    "org.delete",
    "billing.manage",
    "acr.credential.issue",
] as const;
export type OrgDeniedAction = (typeof ORG_IMPERSONATION_DENIED_ACTIONS)[number];

// No web surface calls these today.
export const PLATFORM_ACTIONS_WITHOUT_WEB_SURFACE: readonly PlatformAction[] = [
    "authz.decide",
    "credentials.project",
];

// The only platform controls a session may use while impersonating.
export const IMPERSONATION_ALLOWED_PLATFORM_CONTROLS: readonly string[] = [
    "stopImpersonation",
    "getImpersonationStatus",
];

export type SurfaceKind = "page" | "fn" | "control" | "nav";

export interface PlatformSurface {
    id: string;
    kind: SurfaceKind;
    file: string;
    symbol?: string;
    /** "unmapped": no catalog action; denied only while impersonating. */
    action: PlatformAction | "unmapped" | OrgDeniedAction | "settings.read" | "org.read";
    /** Required when action is "unmapped". */
    reason?: string;
    /** false: no go-api route maps the action yet (CHAOS-11847). */
    serverMapped: boolean;
    impersonation: "denied" | "allowed";
}

const SA = "src/app/(app)/superadmin";
const ORGS = "src/lib/admin/server/orgs.ts";
const BILLING = "src/lib/admin/server/billing.ts";
const SETTINGS = "src/lib/admin/server/settings.ts";
const AUDIT = `${SA}/billing/audit/actions.ts`;
const USERS = "src/lib/admin/server/users.ts";

function row(
    id: string,
    kind: SurfaceKind,
    file: string,
    action: PlatformSurface["action"],
    opts: {
        symbol?: string;
        serverMapped?: boolean;
        impersonation?: "denied" | "allowed";
        reason?: string;
    } = {},
): PlatformSurface {
    return {
        id,
        kind,
        file,
        action,
        symbol: opts.symbol,
        reason: opts.reason,
        serverMapped: opts.serverMapped ?? true,
        impersonation: opts.impersonation ?? "denied",
    };
}

export const PLATFORM_SURFACES: readonly PlatformSurface[] = [
    row("page:/superadmin", "page", `${SA}/page.tsx`, "admin.stats"),
    row("fn:getPlatformStats", "fn", ORGS, "admin.stats", { symbol: "getPlatformStats" }),
    row("page:/superadmin/orgs", "page", `${SA}/orgs/page.tsx`, "admin.orgs"),
    row("page:/superadmin/orgs/[id]", "page", `${SA}/orgs/[id]/page.tsx`, "admin.orgs"),
    row("page:/superadmin/orgs/new", "page", `${SA}/orgs/new/page.tsx`, "admin.orgs"),
    row("fn:listOrganizations", "fn", ORGS, "admin.orgs", { symbol: "listOrganizations" }),
    row("fn:getOrganization", "fn", ORGS, "admin.orgs", { symbol: "getOrganization" }),
    row("fn:createOrganization", "fn", ORGS, "admin.orgs", { symbol: "createOrganization" }),
    row("fn:updateOrganization", "fn", ORGS, "admin.orgs", { symbol: "updateOrganization" }),
    row("fn:deleteOrganization", "fn", ORGS, "admin.orgs", { symbol: "deleteOrganization" }),
    row("fn:dryRunDeleteOrganization", "fn", ORGS, "admin.orgs", {
        symbol: "dryRunDeleteOrganization",
    }),
    row("fn:listOrgMembers", "fn", ORGS, "admin.orgs", { symbol: "listOrgMembers" }),
    row("fn:addOrgMemberByEmail", "fn", ORGS, "admin.orgs", { symbol: "addOrgMemberByEmail" }),
    row("fn:changeOrgMemberRole", "fn", ORGS, "admin.orgs", { symbol: "changeOrgMemberRole" }),
    row("page:/superadmin/users", "page", `${SA}/users/page.tsx`, "admin.users", {
        serverMapped: false,
    }),
    row("page:/superadmin/users/[id]", "page", `${SA}/users/[id]/page.tsx`, "admin.users", {
        serverMapped: false,
    }),
    row("page:/superadmin/users/new", "page", `${SA}/users/new/page.tsx`, "admin.users", {
        serverMapped: false,
    }),
    row("fn:listPlatformUsers", "fn", USERS, "admin.users", {
        symbol: "listPlatformUsers",
        serverMapped: false,
    }),
    row("fn:createPlatformUser", "fn", USERS, "admin.users", {
        symbol: "createPlatformUser",
        serverMapped: false,
    }),
    row("fn:createServiceAccount", "fn", "src/lib/admin/server/serviceAccounts.ts", "admin.users", {
        symbol: "createServiceAccount",
        serverMapped: false,
    }),
    row(
        "control:ImpersonateUserButton",
        "control",
        "src/components/admin/users/ImpersonateUserButton.tsx",
        "admin.impersonate",
    ),
    row("fn:startImpersonation", "fn", ORGS, "admin.impersonate", { symbol: "startImpersonation" }),
    row("fn:stopImpersonation", "fn", ORGS, "admin.impersonate", {
        symbol: "stopImpersonation",
        impersonation: "allowed",
    }),
    row("fn:getImpersonationStatus", "fn", ORGS, "admin.impersonate", {
        symbol: "getImpersonationStatus",
        impersonation: "allowed",
    }),
    row(
        "page:/superadmin/billing/invoices",
        "page",
        `${SA}/billing/invoices/page.tsx`,
        "admin.billing",
    ),
    row("page:/superadmin/billing/plans", "page", `${SA}/billing/plans/page.tsx`, "admin.billing"),
    row(
        "page:/superadmin/billing/refunds",
        "page",
        `${SA}/billing/refunds/page.tsx`,
        "admin.billing",
    ),
    row(
        "page:/superadmin/billing/subscriptions",
        "page",
        `${SA}/billing/subscriptions/page.tsx`,
        "admin.billing",
    ),
    row("page:/superadmin/billing/audit", "page", `${SA}/billing/audit/page.tsx`, "admin.audit"),
    row("page:/superadmin/licensing", "page", `${SA}/licensing/page.tsx`, "admin.flags"),
    row(
        "page:/superadmin/licensing/[orgId]",
        "page",
        `${SA}/licensing/[orgId]/page.tsx`,
        "admin.flags",
    ),
    row("fn:listFeatureFlags", "fn", BILLING, "admin.flags", { symbol: "listFeatureFlags" }),
    row("fn:createFeatureOverride", "fn", BILLING, "admin.flags", {
        symbol: "createFeatureOverride",
    }),
    row("fn:deleteFeatureOverride", "fn", BILLING, "admin.flags", {
        symbol: "deleteFeatureOverride",
    }),
    row("fn:grantPlatformModelFallback", "fn", BILLING, "admin.flags", {
        symbol: "grantPlatformModelFallback",
    }),
    row("fn:revokePlatformModelFallback", "fn", BILLING, "admin.flags", {
        symbol: "revokePlatformModelFallback",
    }),
    row("page:/superadmin/audit", "page", `${SA}/audit/page.tsx`, "admin.audit"),
    row("fn:listPlatformAuditLogs", "fn", ORGS, "admin.audit", { symbol: "listPlatformAuditLogs" }),
    row(
        "page:/superadmin/product-telemetry",
        "page",
        `${SA}/product-telemetry/page.tsx`,
        "admin.telemetry",
    ),
    row(
        "page:/superadmin/product-telemetry/[orgId]",
        "page",
        `${SA}/product-telemetry/[orgId]/page.tsx`,
        "admin.telemetry",
    ),
    row(
        "page:/superadmin/service-accounts/new",
        "page",
        `${SA}/service-accounts/new/page.tsx`,
        "admin.users",
        {
            serverMapped: false,
        },
    ),
    row(
        "page:/superadmin/context-fabric/validation",
        "page",
        `${SA}/context-fabric/validation/page.tsx`,
        "unmapped",
        {
            reason: "ACR capability surface with its own authorization; no platform catalog action",
        },
    ),
    row("fn:getCurrentOrg", "fn", ORGS, "org.read", { symbol: "getCurrentOrg" }),
    row("fn:getUser", "fn", USERS, "admin.users", { symbol: "getUser", serverMapped: false }),
    row("fn:updateUser", "fn", USERS, "admin.users", { symbol: "updateUser", serverMapped: false }),
    row("fn:deleteUser", "fn", USERS, "admin.users", { symbol: "deleteUser", serverMapped: false }),
    row("fn:setUserPassword", "fn", USERS, "admin.users", {
        symbol: "setUserPassword",
        serverMapped: false,
    }),
    row("fn:getOrgEntitlements", "fn", BILLING, "admin.flags", { symbol: "getOrgEntitlements" }),
    row("fn:listFeatureOverrides", "fn", BILLING, "admin.flags", {
        symbol: "listFeatureOverrides",
    }),
    row("fn:getAuditLog", "fn", AUDIT, "admin.audit", { symbol: "getAuditLog" }),
    row("fn:getAuditEntry", "fn", AUDIT, "admin.audit", { symbol: "getAuditEntry" }),
    row("fn:resolveAuditMismatch", "fn", AUDIT, "admin.billing", {
        symbol: "resolveAuditMismatch",
    }),
    row("fn:triggerReconciliation", "fn", AUDIT, "admin.billing", {
        symbol: "triggerReconciliation",
    }),
    // The settings page calls org-scoped go-api routes: org actions, no admin.settings action.
    // settings.read is allowed to a delegated session in the catalog; this page is a superadmin
    // surface and takes the same impersonation deny as the other superadmin pages.
    row("page:/superadmin/settings", "page", `${SA}/settings/page.tsx`, "settings.write"),
    row("fn:listSettingCategories", "fn", SETTINGS, "settings.read", {
        symbol: "listSettingCategories",
    }),
    row("fn:listSettings", "fn", SETTINGS, "settings.read", { symbol: "listSettings" }),
    row("nav:platform", "nav", "src/lib/navigation/areas.ts", "admin.stats", {
        symbol: "platformAdminOnly",
    }),
    row("nav:platform-billing", "nav", "src/components/admin/AdminTabs.tsx", "admin.billing"),
    row("fn:updateCurrentOrg", "fn", ORGS, "org.write", { symbol: "updateCurrentOrg" }),
    row("fn:updateOrgProfile", "fn", ORGS, "org.write", { symbol: "updateOrgProfile" }),
    row("fn:deleteCurrentOrg", "fn", ORGS, "org.delete", { symbol: "deleteCurrentOrg" }),
    row(
        "route:github-app/install",
        "fn",
        "src/app/(app)/org/admin/integrations/github-app/install/route.ts",
        "integrations.write",
    ),
    row(
        "route:github-app/callback",
        "fn",
        "src/app/(app)/org/admin/integrations/github-app/callback/route.ts",
        "integrations.write",
    ),
];
