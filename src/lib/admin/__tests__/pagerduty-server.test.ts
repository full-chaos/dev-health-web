import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { mockAuth } from "@/test/mocks/auth";
import { createCredential } from "../server/credentials";
import {
    completePagerDutyOAuth,
    connectPagerDutyApiToken,
    connectPagerDutyClientCredentials,
    startPagerDutyOAuth,
} from "../server/pagerduty";

const entitlementWithoutFeature = {
    org_id: "org-1",
    tier: "enterprise",
    licensed_users: null,
    licensed_repos: null,
    features: {},
    features_override: null,
    limits_override: null,
    expires_at: null,
    is_valid: true,
    limits: {},
};

describe("PagerDuty server actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
        mockAuth({ user: { id: "u-1", org_id: "org-1" }, access_token: "test-token" });
    });

    it("fails closed before starting OAuth when an older Ops response omits the entitlement", async () => {
        const fetchSpy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(
                new Response(JSON.stringify(entitlementWithoutFeature), { status: 200 }),
            );

        await expect(
            startPagerDutyOAuth({
                credentialName: "production",
                datasets: ["services"],
                region: "us",
                subdomain: "acme",
            }),
        ).resolves.toEqual({ error: "PagerDuty connections are currently unavailable." });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe(
            "http://test-ops:8000/api/v1/licensing/entitlements/org-1",
        );
        fetchSpy.mockRestore();
    });

    it("fails closed before the generic credential action can create a PagerDuty credential", async () => {
        const fetchSpy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(
                new Response(JSON.stringify(entitlementWithoutFeature), { status: 200 }),
            );

        await expect(
            createCredential({
                provider: "pagerduty",
                name: "production",
                credentials: { apiToken: "secret" },
            }),
        ).resolves.toEqual({ error: "PagerDuty connections are currently unavailable." });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe(
            "http://test-ops:8000/api/v1/licensing/entitlements/org-1",
        );
        fetchSpy.mockRestore();
    });

    it.each([
        [
            "API token",
            () =>
                connectPagerDutyApiToken({
                    credentialName: "production",
                    apiToken: "secret",
                    region: "us",
                    subdomain: "acme",
                }),
        ],
        [
            "client credentials",
            () =>
                connectPagerDutyClientCredentials({
                    credentialName: "production",
                    clientId: "client-id",
                    clientSecret: "secret",
                    region: "us",
                    subdomain: "acme",
                }),
        ],
    ])("fails closed before %s can create a PagerDuty credential", async (_method, connect) => {
        const fetchSpy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(
                new Response(JSON.stringify(entitlementWithoutFeature), { status: 200 }),
            );

        await expect(connect()).resolves.toEqual({
            error: "PagerDuty connections are currently unavailable.",
        });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        fetchSpy.mockRestore();
    });

    it("starts OAuth only after an explicit true entitlement", async () => {
        const fetchSpy = vi
            .spyOn(global, "fetch")
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        ...entitlementWithoutFeature,
                        features: { canonical_incident_ingestion: true },
                    }),
                    { status: 200 },
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ authorize_url: "https://pagerduty.example/authorize" }),
                    {
                        status: 200,
                    },
                ),
            );

        await expect(
            startPagerDutyOAuth({
                credentialName: "production",
                datasets: ["services"],
                region: "us",
                subdomain: "acme",
            }),
        ).resolves.toEqual({ data: { authorize_url: "https://pagerduty.example/authorize" } });

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        fetchSpy.mockRestore();
    });

    it("completes an OAuth callback started while enabled after the entitlement flips off", async () => {
        let entitlementEnabled = true;
        let callbackAttempts = 0;
        const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
            const url = String(input);

            if (url.endsWith("/api/v1/licensing/entitlements/org-1")) {
                return new Response(
                    JSON.stringify({
                        ...entitlementWithoutFeature,
                        features: { canonical_incident_ingestion: entitlementEnabled },
                    }),
                    { status: 200 },
                );
            }

            if (url.endsWith("/api/v1/admin/integrations/pagerduty/authorize")) {
                return new Response(
                    JSON.stringify({ authorize_url: "https://pagerduty.example/authorize" }),
                    { status: 200 },
                );
            }

            if (url.endsWith("/api/v1/admin/integrations/pagerduty/callback")) {
                callbackAttempts += 1;
                if (callbackAttempts === 1) {
                    return new Response(
                        JSON.stringify({
                            connected: true,
                            credential_name: "production",
                            region: "us",
                            subdomain: "acme",
                            granted_scopes: ["services.read"],
                        }),
                        { status: 200 },
                    );
                }
                return new Response(
                    JSON.stringify({ detail: "Invalid or expired PagerDuty OAuth state" }),
                    { status: 400 },
                );
            }

            throw new Error(`Unexpected request: ${url}`);
        });

        await expect(
            startPagerDutyOAuth({
                credentialName: "production",
                datasets: ["services"],
                region: "us",
                subdomain: "acme",
            }),
        ).resolves.toEqual({ data: { authorize_url: "https://pagerduty.example/authorize" } });

        entitlementEnabled = false;

        await expect(
            completePagerDutyOAuth({ state: "callback-state", code: "oauth-code" }),
        ).resolves.toEqual({
            data: {
                connected: true,
                credential_name: "production",
                region: "us",
                subdomain: "acme",
                granted_scopes: ["services.read"],
            },
        });

        await expect(
            completePagerDutyOAuth({ state: "callback-state", code: "oauth-code" }),
        ).resolves.toEqual({
            error: "Invalid or expired PagerDuty OAuth state",
        });

        const entitlementRequests = fetchSpy.mock.calls.filter(([input]) =>
            String(input).endsWith("/api/v1/licensing/entitlements/org-1"),
        );
        const authorizeRequests = fetchSpy.mock.calls.filter(([input]) =>
            String(input).endsWith("/api/v1/admin/integrations/pagerduty/authorize"),
        );
        const callbackRequests = fetchSpy.mock.calls.filter(([input]) =>
            String(input).endsWith("/api/v1/admin/integrations/pagerduty/callback"),
        );

        expect(entitlementRequests).toHaveLength(1);
        expect(authorizeRequests).toHaveLength(1);
        expect(callbackRequests).toHaveLength(2);
        expect(callbackAttempts).toBe(2);
        fetchSpy.mockRestore();
    });

    it("returns the Ops invalid-state error for an unstarted OAuth callback", async () => {
        const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Invalid or expired PagerDuty OAuth state" }), {
                status: 400,
            }),
        );

        await expect(
            completePagerDutyOAuth({ state: "callback-state", code: "oauth-code" }),
        ).resolves.toEqual({
            error: "Invalid or expired PagerDuty OAuth state",
        });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toBe(
            "http://test-ops:8000/api/v1/admin/integrations/pagerduty/callback",
        );
        fetchSpy.mockRestore();
    });
});
