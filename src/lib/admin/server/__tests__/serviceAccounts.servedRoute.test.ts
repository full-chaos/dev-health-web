import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/_request", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../api/_request")>()),
    request: vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-0000000000a1" }),
}));
vi.mock("../_shared", () => ({
    requireSuperuserToken: vi.fn(async () => "synthetic-token"),
    withErrorHandling: async <T>(fn: () => Promise<T>) => {
        try {
            return { data: await fn() };
        } catch (err) {
            return { error: String(err) };
        }
    },
}));

import { request } from "../../api/_request";
import { createServiceAccount } from "../serviceAccounts";

const mockRequest = vi.mocked(request);
const ORG = "00000000-0000-4000-8000-0000000000b1";
const OWNER = "00000000-0000-4000-8000-0000000000c1";

beforeEach(() => mockRequest.mockClear());

describe("createServiceAccount calls the served service-account route", () => {
    it("posts to /service-accounts with organization_id, owner_principal_id and name", async () => {
        await createServiceAccount({
            name: "ci-bot",
            organization_id: ORG,
            owner_principal_id: OWNER,
        });

        expect(mockRequest).toHaveBeenCalledOnce();
        const [path, options] = mockRequest.mock.calls[0];
        expect(path).toBe("/service-accounts");
        const body = JSON.parse((options as RequestInit).body as string);
        expect(body).toEqual({ organization_id: ORG, owner_principal_id: OWNER, name: "ci-bot" });
    });

    it("control: an invalid name makes no request", async () => {
        const result = await createServiceAccount({
            name: "Bad Name",
            organization_id: ORG,
            owner_principal_id: OWNER,
        });
        expect(result.error).toBeTruthy();
        expect(mockRequest).not.toHaveBeenCalled();
    });
});
