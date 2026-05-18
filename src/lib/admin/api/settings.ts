import { request } from "./_request";
import type {
  Setting,
  SettingCreate,
  SettingUpdate,
  SettingsListResponse,
} from "../types";

export const settingsApi = {
  listCategories: (token?: string, orgId?: string) =>
    request<string[]>("/settings/categories", {}, token, orgId),

  listByCategory: (category: string, token?: string, orgId?: string) =>
    request<SettingsListResponse>(`/settings/${category}`, {}, token, orgId),

  get: (category: string, key: string, token?: string, orgId?: string) =>
    request<Setting>(`/settings/${category}/${key}`, {}, token, orgId),

  create: (data: SettingCreate, token?: string, orgId?: string) =>
    request<Setting>("/settings", { method: "POST", body: JSON.stringify(data) }, token, orgId),

  update: (category: string, key: string, data: SettingUpdate, token?: string, orgId?: string) =>
    request<Setting>(
      `/settings/${category}/${key}`,
      { method: "PUT", body: JSON.stringify(data) },
      token,
      orgId
    ),

  delete: (category: string, key: string, token?: string, orgId?: string) =>
    request<void>(`/settings/${category}/${key}`, { method: "DELETE" }, token, orgId),
};
