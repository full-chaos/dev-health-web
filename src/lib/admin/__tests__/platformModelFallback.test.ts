import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { revalidatePath } from "next/cache";
import { mockAuth } from "@/test/mocks/auth";
import { grantPlatformModelFallback, revokePlatformModelFallback } from "../server";

const FLAG = { id: "flag-pmf", key: "platform_model_fallback", name: "Platform Model Fallback" };
const OTHER_FLAG = { id: "flag-other", key: "ask_dev", name: "Ask Dev" };

function overrideRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "ov-1",
        org_id: "org-9",
        feature_id: FLAG.id,
        feature_key: FLAG.key,
        is_enabled: true,
        expires_at: null,
        config: null,
        reason: "Platform admin grant",
        created_by: "admin-1",
        created_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

type Call = { method: string; path: string; body: unknown };

function stubOps(routes: { overrides: unknown[]; flags?: unknown[] }) {
    const calls: Call[] = [];
    const spy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(
            typeof input === "string" ? input : ((input as Request).url ?? String(input)),
        );
        const method = init?.method ?? "GET";
        calls.push({
            method,
            path: url.pathname,
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (url.pathname.endsWith("/feature-flags")) {
            return new Response(JSON.stringify(routes.flags ?? [OTHER_FLAG, FLAG]), {
                status: 200,
            });
        }
        if (method === "GET") {
            return new Response(JSON.stringify(routes.overrides), { status: 200 });
        }
        if (method === "DELETE") {
            return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify(overrideRow()), { status: 201 });
    });
    return { calls, spy };
}

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

describe("platform model fallback actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    describe("grantPlatformModelFallback", () => {
        it("POSTs one org override for the platform_model_fallback flag id", async () => {
            mockAuth({ user: { is_superuser: true } });
            const { calls } = stubOps({ overrides: [] });

            const result = await grantPlatformModelFallback("org-9");

            expect(result.error).toBeUndefined();
            expect(result.data).toEqual({ changed: true, notice: "Platform admin grant saved." });
            const posts = writes(calls);
            expect(posts).toHaveLength(1);
            expect(posts[0].method).toBe("POST");
            expect(posts[0].path).toMatch(/\/orgs\/org-9\/feature-overrides$/);
            expect(posts[0].body).toEqual({
                feature_id: "flag-pmf",
                is_enabled: true,
                reason: "Platform admin grant",
            });
            expect(revalidatePath).toHaveBeenCalledWith("/superadmin/licensing/org-9");
        });

        it("is a no-op when an active grant already exists", async () => {
            mockAuth({ user: { is_superuser: true } });
            const { calls } = stubOps({ overrides: [overrideRow()] });

            const result = await grantPlatformModelFallback("org-9");

            expect(result.data?.changed).toBe(false);
            expect(writes(calls)).toHaveLength(0);
            expect(revalidatePath).toHaveBeenCalledWith("/superadmin/licensing/org-9");
        });

        it("replaces a disabled grant row: DELETE it, then POST", async () => {
            mockAuth({ user: { is_superuser: true } });
            const { calls } = stubOps({ overrides: [overrideRow({ is_enabled: false })] });

            const result = await grantPlatformModelFallback("org-9");

            expect(result.data?.changed).toBe(true);
            expect(
                writes(calls).map((c) => `${c.method} ${c.path.replace(/^.*\/orgs\/org-9\//, "")}`),
            ).toEqual(["DELETE feature-overrides/ov-1", "POST feature-overrides"]);
        });

        it("replaces an expired grant row", async () => {
            mockAuth({ user: { is_superuser: true } });
            const { calls } = stubOps({
                overrides: [overrideRow({ expires_at: "2020-01-01T00:00:00Z" })],
            });

            await grantPlatformModelFallback("org-9");

            expect(writes(calls).map((c) => c.method)).toEqual(["DELETE", "POST"]);
        });

        it("returns an error and writes nothing when the flag is not in the catalog", async () => {
            mockAuth({ user: { is_superuser: true } });
            const { calls } = stubOps({ overrides: [], flags: [OTHER_FLAG] });

            const result = await grantPlatformModelFallback("org-9");

            expect(result.error).toBeTruthy();
            expect(writes(calls)).toHaveLength(0);
        });

        it("refuses a non-platform-admin session with zero ops calls", async () => {
            mockAuth({ user: { is_superuser: false } });
            const { spy } = stubOps({ overrides: [] });

            const result = await grantPlatformModelFallback("org-9");

            expect(result.error).toBeTruthy();
            expect(result.data).toBeUndefined();
            expect(spy).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("refuses a missing session with zero ops calls", async () => {
            mockAuth(null);
            const { spy } = stubOps({ overrides: [] });

            const result = await grantPlatformModelFallback("org-9");

            expect(result.error).toBeTruthy();
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe("revokePlatformModelFallback", () => {
        it("DELETEs the platform_model_fallback override row only", async () => {
            mockAuth({ user: { is_superuser: true } });
            const { calls } = stubOps({
                overrides: [
                    overrideRow({
                        id: "ov-other",
                        feature_id: OTHER_FLAG.id,
                        feature_key: "ask_dev",
                    }),
                    overrideRow({ id: "ov-pmf" }),
                ],
            });

            const result = await revokePlatformModelFallback("org-9");

            expect(result.data).toEqual({
                changed: true,
                notice: "Platform admin grant removed.",
            });
            const deletes = writes(calls);
            expect(deletes).toHaveLength(1);
            expect(deletes[0].method).toBe("DELETE");
            expect(deletes[0].path).toMatch(/\/orgs\/org-9\/feature-overrides\/ov-pmf$/);
            expect(revalidatePath).toHaveBeenCalledWith("/superadmin/licensing/org-9");
        });

        it("is a no-op with a clear message when no grant row exists", async () => {
            mockAuth({ user: { is_superuser: true } });
            const { calls } = stubOps({ overrides: [] });

            const result = await revokePlatformModelFallback("org-9");

            expect(result.error).toBeUndefined();
            expect(result.data).toEqual({
                changed: false,
                notice: "No platform admin grant exists for this org.",
            });
            expect(writes(calls)).toHaveLength(0);
            expect(revalidatePath).toHaveBeenCalledWith("/superadmin/licensing/org-9");
        });

        it("refuses a non-platform-admin session with zero ops calls", async () => {
            mockAuth({ user: { is_superuser: false } });
            const { spy } = stubOps({ overrides: [overrideRow()] });

            const result = await revokePlatformModelFallback("org-9");

            expect(result.error).toBeTruthy();
            expect(spy).not.toHaveBeenCalled();
        });
    });
});
