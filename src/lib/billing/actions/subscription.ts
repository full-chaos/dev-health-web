"use server";

import type { ActionResult } from "@/lib/result";
import {
    apiRequest,
    getAuthHeaders,
    getBackendUrl,
    resolveOrgId,
    withErrorHandling,
} from "./_shared";

export type SubscriptionDetails = {
    id: string;
    org_id?: string;
    status: "active" | "past_due" | "canceled" | "trialing" | "incomplete";
    stripe_subscription_id: string;
    stripe_customer_id: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
    trial_start: string | null;
    trial_end: string | null;
    plan?: Record<string, unknown> | null;
    price?: Record<string, unknown> | null;
};

export type SubscriptionHistoryItem = {
    id: string;
    stripe_event_id: string;
    event_type: string;
    previous_status: string | null;
    new_status: string;
    processed_at: string;
    payload: Record<string, unknown>;
};

type SubscriptionHistoryResponse = {
    items: SubscriptionHistoryItem[];
    total: number;
    limit: number;
    offset: number;
};

type CheckoutSessionResponse = {
    session_id: string;
    url: string;
};

export type SubscriptionRecord = SubscriptionDetails & {
    org_id: string;
};

export type SubscriptionListResponse = {
    items: SubscriptionRecord[];
    total: number;
    limit: number;
    offset: number;
};

export async function getSubscription(orgId?: string): Promise<ActionResult<SubscriptionDetails>> {
    const orgResult = await resolveOrgId(orgId);
    if (orgResult.error) {
        return orgResult;
    }

    return withErrorHandling(async () => {
        const params = new URLSearchParams();
        if (orgResult.data) {
            params.set("org_id", orgResult.data);
        }
        const query = params.size > 0 ? `?${params.toString()}` : "";
        return apiRequest<SubscriptionDetails>(`/api/v1/billing/subscriptions${query}`);
    });
}

export async function startTrialCheckout(): Promise<ActionResult<{ url: string }>> {
    const headersResult = await getAuthHeaders();
    if (headersResult.error) {
        return headersResult;
    }

    try {
        const res = await fetch(`${getBackendUrl()}/api/v1/billing/checkout`, {
            method: "POST",
            headers: headersResult.data,
            body: JSON.stringify({
                tier: "team",
                success_url: "/dashboard?trial=started",
                cancel_url: "/dashboard?trial=setup_incomplete",
            }),
            cache: "no-store",
        });

        if (!res.ok) {
            const detail = await res.json().catch(() => ({ detail: res.statusText }));
            return { error: detail.detail || `Failed to create checkout session (${res.status})` };
        }

        const data = (await res.json()) as CheckoutSessionResponse;
        if (!data.url) {
            return { error: "Checkout session did not return a redirect URL" };
        }

        return { data: { url: data.url } };
    } catch (err) {
        return { error: err instanceof Error ? err.message : "Unknown error" };
    }
}

export async function getSubscriptions(
    limit = 20,
    offset = 0,
    orgId?: string,
): Promise<ActionResult<SubscriptionListResponse>> {
    const orgResult = await resolveOrgId(orgId);
    if (orgResult.error) {
        return orgResult;
    }

    return withErrorHandling(async () => {
        const params = new URLSearchParams({
            limit: String(limit),
            offset: String(offset),
        });
        if (orgResult.data) {
            params.set("org_id", orgResult.data);
        }
        return apiRequest<SubscriptionListResponse>(
            `/api/v1/billing/subscriptions/list?${params.toString()}`,
        );
    });
}

export async function getSubscriptionHistory(
    limit = 20,
    offset = 0,
    orgId?: string,
): Promise<ActionResult<SubscriptionHistoryResponse>> {
    const orgResult = await resolveOrgId(orgId);
    if (orgResult.error) {
        return orgResult;
    }

    return withErrorHandling(async () => {
        const params = new URLSearchParams({
            limit: String(limit),
            offset: String(offset),
        });
        if (orgResult.data) {
            params.set("org_id", orgResult.data);
        }
        return apiRequest<SubscriptionHistoryResponse>(
            `/api/v1/billing/subscriptions/history?${params.toString()}`,
        );
    });
}

export async function changePlan(priceId: string): Promise<ActionResult<{ status: string }>> {
    return withErrorHandling(async () => {
        return apiRequest<{ status: string }>("/api/v1/billing/subscriptions/change-plan", {
            method: "POST",
            body: JSON.stringify({ price_id: priceId }),
        });
    });
}

export async function cancelSubscription(
    immediately: boolean,
): Promise<ActionResult<{ status: string }>> {
    return withErrorHandling(async () => {
        return apiRequest<{ status: string }>("/api/v1/billing/subscriptions/cancel", {
            method: "POST",
            body: JSON.stringify({ immediately }),
        });
    });
}

export async function reactivateSubscription(): Promise<ActionResult<{ status: string }>> {
    return withErrorHandling(async () => {
        return apiRequest<{ status: string }>("/api/v1/billing/subscriptions/reactivate", {
            method: "POST",
            body: JSON.stringify({}),
        });
    });
}

export async function getBillingPortalUrl(orgId?: string): Promise<ActionResult<{ url: string }>> {
    const orgResult = await resolveOrgId(orgId);
    if (orgResult.error) {
        return orgResult;
    }

    return withErrorHandling(async () => {
        const params = new URLSearchParams();
        if (orgResult.data) {
            params.set("org_id", orgResult.data);
        }
        const query = params.size > 0 ? `?${params.toString()}` : "";
        return apiRequest<{ url: string }>(`/api/v1/billing/portal${query}`, {
            method: "POST",
            body: JSON.stringify({}),
        });
    });
}
