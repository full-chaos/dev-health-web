export { AdminApiError } from "./api/_request";

import { settingsApi } from "./api/settings";
import { credentialsApi } from "./api/credentials";
import { syncConfigsApi } from "./api/sync";
import { identitiesApi } from "./api/identities";
import { teamsApi } from "./api/teams";
import { usersApi } from "./api/users";
import { orgsApi } from "./api/orgs";
import { licensingApi } from "./api/billing";
import { auditApi, platformAuditApi } from "./api/audit";
import { ipAllowlistApi } from "./api/security";
import { retentionApi } from "./api/retention";
import { llmSettingsApi } from "./api/llm-settings";
import { platformApi, impersonationApi } from "./api/platform";
import { setupApi } from "./api/setup";
import { customerPushApi } from "./api/customer-push";

export const adminApi = {
    settings: settingsApi,
    credentials: credentialsApi,
    syncConfigs: syncConfigsApi,
    customerPush: customerPushApi,
    identities: identitiesApi,
    teams: teamsApi,
    users: usersApi,
    orgs: orgsApi,
    licensing: licensingApi,
    audit: auditApi,
    ipAllowlist: ipAllowlistApi,
    retention: retentionApi,
    llmSettings: llmSettingsApi,
    impersonation: impersonationApi,
    platform: platformApi,
    platformAudit: platformAuditApi,
    setup: setupApi,
};

export type AdminApi = typeof adminApi;
