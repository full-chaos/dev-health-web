import "server-only";
import type { Session } from "next-auth";
import { ORG_ADMIN_ROLES } from "../shadow/catalog";

// The closed table of guards. A row with an `action` is decided by the policy decision point when
// the switch is on, and its `legacy` rule is then never read. A row with no action has no catalog
// action to ask and keeps its client rule (the census lists each use and the reason).

export type GuardId = "platform.orgs" | "platform.users" | "org.integrations.write" | "unmapped";

export interface GuardRow {
    action: string | null;
    resource: "platform" | "organization";
    legacy: (user: Session["user"] | undefined) => boolean;
    legacyDenyMessage: string;
}

const superuser = (user: Session["user"] | undefined): boolean => user?.is_superuser === true;

export const GUARDS: Readonly<Record<GuardId, GuardRow>> = {
    "platform.orgs": {
        action: "admin.orgs",
        resource: "platform",
        legacy: superuser,
        legacyDenyMessage: "Superuser access required",
    },
    "platform.users": {
        action: "admin.users.unknown",
        resource: "platform",
        legacy: superuser,
        legacyDenyMessage: "Superuser access required",
    },
    "org.integrations.write": {
        action: "integrations.write",
        resource: "organization",
        legacy: (user) =>
            superuser(user) || (ORG_ADMIN_ROLES as readonly string[]).includes(user?.role ?? ""),
        legacyDenyMessage: "Forbidden",
    },
    unmapped: {
        action: null,
        resource: "platform",
        legacy: superuser,
        legacyDenyMessage: "Superuser access required",
    },
};
