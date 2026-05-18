"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/lib/result";
import { apiRequest, getBackendUrl, sanitizeId, withErrorHandling } from "./_shared";

export type BillingPriceInput = {
  interval: "monthly" | "yearly";
  amount: number;
  currency?: string;
  is_active?: boolean;
  stripe_price_id?: string | null;
};

export type BillingPlanRecord = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  tier: string;
  is_active: boolean;
  display_order: number;
  stripe_product_id: string | null;
  metadata: Record<string, unknown>;
  prices: Array<{
    id: string;
    plan_id: string;
    interval: string;
    amount: number;
    currency: string;
    is_active: boolean;
    stripe_price_id: string | null;
  }>;
  bundles: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    features: string[];
  }>;
};

export type BillingPlanUpsert = {
  key: string;
  name: string;
  description?: string | null;
  tier: string;
  is_active?: boolean;
  display_order?: number;
  metadata?: Record<string, unknown>;
  prices?: BillingPriceInput[];
  bundle_ids?: string[];
};

export type PullStripeResult = {
  created: string[];
  updated: string[];
  skipped: string[];
  errors: string[];
};

export async function listBillingPlans(includeInactive = false): Promise<ActionResult<BillingPlanRecord[]>> {
  try {
    const session = await auth();
    const headers: HeadersInit = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const url = `${getBackendUrl()}/api/v1/billing/plans${includeInactive ? "?include_inactive=true" : ""}`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Failed to load plans (${res.status})` };
    }

    const data = (await res.json()) as BillingPlanRecord[];
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function createBillingPlan(data: BillingPlanUpsert): Promise<ActionResult<BillingPlanRecord>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }

    const res = await fetch(`${getBackendUrl()}/api/v1/billing/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Failed to create plan (${res.status})` };
    }

    const plan = (await res.json()) as BillingPlanRecord;
    revalidatePath("/pricing");
    return { data: plan };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function updateBillingPlan(
  planId: string,
  data: Partial<BillingPlanUpsert>
): Promise<ActionResult<BillingPlanRecord>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }

    const res = await fetch(`${getBackendUrl()}/api/v1/billing/plans/${sanitizeId(planId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Failed to update plan (${res.status})` };
    }

    const plan = (await res.json()) as BillingPlanRecord;
    revalidatePath("/pricing");
    return { data: plan };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function deleteBillingPlan(planId: string): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }

    const res = await fetch(`${getBackendUrl()}/api/v1/billing/plans/${sanitizeId(planId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Failed to delete plan (${res.status})` };
    }

    const result = (await res.json()) as { deleted: boolean };
    revalidatePath("/pricing");
    return { data: result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function syncBillingPlanToStripe(planId: string): Promise<ActionResult<BillingPlanRecord>> {
  try {
    const session = await auth();
    if (!session?.access_token) {
      return { error: "Unauthorized" };
    }

    const res = await fetch(`${getBackendUrl()}/api/v1/billing/plans/${sanitizeId(planId)}/sync-stripe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      return { error: error.detail || `Failed to sync plan (${res.status})` };
    }

    const plan = (await res.json()) as BillingPlanRecord;
    revalidatePath("/pricing");
    return { data: plan };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function pullPlansFromStripe(): Promise<ActionResult<PullStripeResult>> {
  const result = await withErrorHandling(() =>
    apiRequest<PullStripeResult>("/api/v1/billing/plans/pull-stripe", { method: "POST" })
  );
  if (!result.error) {
    revalidatePath("/pricing");
  }
  return result;
}
