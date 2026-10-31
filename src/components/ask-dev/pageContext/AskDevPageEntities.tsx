"use client";

import { useMemo } from "react";

import { useShellOrganization } from "@/components/shell/ShellContext";
import { SUBJECT_ID } from "@/lib/ask-dev/page-context-ids";
import type { PageEntityInput } from "@/lib/ask-dev/page-context";
import { useOrgId } from "@/lib/graphql/orgIdContext";

import { useAskDevPageContext } from "./AskDevPageContext";

/**
 * A page's Ask Dev context, stated from a server page (CHAOS-11938): the entities it shows, in
 * ACR's canonical ids, and, with `organization`, the active organization first. The organization
 * is the session's (`useOrgId`) with the name the shell loaded, and only while the shell shows
 * that same organization: during a switch the shell moves first, so an id and a name of two
 * organizations are never paired (codex r2 on #1647). Until the name is there it is not proposed,
 * so a chip never shows an id. Renders nothing; registering sends nothing.
 */
const NONE: readonly PageEntityInput[] = [];

export function AskDevPageEntities({
    entities = NONE,
    organization = false,
}: {
    entities?: readonly PageEntityInput[];
    organization?: boolean;
}) {
    const orgId = useOrgId();
    const shellOrganization = useShellOrganization();
    // The shell's name, only when the shell shows the session's organization.
    const orgName =
        shellOrganization?.id !== undefined && shellOrganization.id === orgId
            ? shellOrganization.name.trim()
            : "";
    const refs = useMemo(() => {
        const orgRef = organization ? organizationEntity(orgId, orgName) : null;
        return orgRef === null ? entities : [orgRef, ...entities];
    }, [entities, organization, orgId, orgName]);
    useAskDevPageContext(refs);
    return null;
}

function organizationEntity(orgId: string | undefined, name: string): PageEntityInput | null {
    const id = SUBJECT_ID.organization(orgId);
    return id === null || name === "" ? null : { kind: "organization", id, label: name };
}
