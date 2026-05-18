"use server";

import { adminApi } from "../api";
import type { ActionResult } from "@/lib/result";
import type { User, UserCreate, UserUpdate } from "../types";
import { getSessionContext, getToken, withErrorHandling } from "./_shared";

export async function listUsers(query?: string): Promise<ActionResult<User[]>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.list(token, orgId, query);
  });
}

export async function listPlatformUsers(query?: string): Promise<ActionResult<User[]>> {
  return withErrorHandling(async () => {
    const token = await getToken();
    return adminApi.users.list(token, undefined, query);
  });
}

export async function getUser(userId: string): Promise<ActionResult<User>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.get(userId, token, orgId);
  });
}

export async function createUser(data: UserCreate): Promise<ActionResult<User>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.create(data, token, orgId);
  });
}

export async function updateUser(userId: string, data: UserUpdate): Promise<ActionResult<User>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.update(userId, data, token, orgId);
  });
}

export async function deleteUser(userId: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.delete(userId, token, orgId);
  });
}

export async function setUserPassword(userId: string, password: string): Promise<ActionResult<void>> {
  return withErrorHandling(async () => {
    const { token, orgId } = await getSessionContext();
    return adminApi.users.setPassword(userId, password, token, orgId);
  });
}
