import "server-only";

// authorization_request.v1 builder. A request carries no authority: the principal is an opaque
// reference the decision point resolves; there is no member for roles, scopes or an actor.

export const RESOURCE_TYPES = [
    "organization",
    "repository",
    "membership",
    "service_account",
    "grant",
    "credential",
    "session",
    "signing_key",
    "subscription",
    "platform",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export interface AuthorizeRequest {
    principalReference: string;
    action: string;
    resource: { type: ResourceType; key: string; organizationId?: string };
    requestId: string;
}

const PRINCIPAL_REFERENCE = /^[A-Za-z0-9._~-]{16,1000}$/;
const ACTION = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const REQUEST_ID = /^req_[A-Za-z0-9_-]{26}$/;
const REPO_KEY = /^([a-z0-9][a-z0-9._-]{0,99}\/[a-z0-9][a-z0-9._-]{0,99}|\*)$/;
const OTHER_KEY = /^[a-z0-9][a-z0-9._:-]{0,255}$/;

export const CLIENT_SERVICE = "dev-health-web";

export function buildRequestBody(r: AuthorizeRequest): Record<string, unknown> | null {
    if (!PRINCIPAL_REFERENCE.test(r.principalReference)) return null;
    if (!ACTION.test(r.action)) return null;
    if (!REQUEST_ID.test(r.requestId)) return null;
    if (!(RESOURCE_TYPES as readonly string[]).includes(r.resource.type)) return null;
    const keyOk = r.resource.type === "repository" ? REPO_KEY : OTHER_KEY;
    if (!keyOk.test(r.resource.key)) return null;
    const orgId = r.resource.organizationId;
    if (orgId !== undefined && orgId === "") return null;
    const resource: Record<string, unknown> = { type: r.resource.type, key: r.resource.key };
    if (orgId !== undefined) resource.organization_id = orgId;
    return {
        schema_version: "authorization_request.v1",
        principal_reference: r.principalReference,
        action: r.action,
        resource,
        context: { request_id: r.requestId, client_service: CLIENT_SERVICE },
    };
}
