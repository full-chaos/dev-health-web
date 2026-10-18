import { request } from "./_request";
import type { IntegrationDataset, IntegrationSummary } from "../types";

export const integrationsApi = {
    list: (token?: string, orgId?: string) =>
        request<IntegrationSummary[]>("/integrations", {}, token, orgId),

    datasets: (integrationId: string, token?: string, orgId?: string) =>
        request<IntegrationDataset[]>(`/integrations/${integrationId}/datasets`, {}, token, orgId),
};
