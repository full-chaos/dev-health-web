import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));
const fetchMock = vi.fn();
vi.mock("@/lib/serverDeadline", () => ({
    fetchWithDeadline: (...args: unknown[]) => fetchMock(...args),
}));

import { request } from "../_request";

describe("admin request errors", () => {
    it("never surface the submitted value of a 422", async () => {
        const probe = "zz-probe-value-81f3";
        fetchMock.mockResolvedValue({
            ok: false,
            status: 422,
            statusText: "Unprocessable Entity",
            json: async () => ({
                detail: [
                    {
                        type: "missing",
                        loc: ["body", "admin_password"],
                        msg: "Field required",
                        input: { password: probe },
                    },
                ],
            }),
        });
        const error = await request("/users/u/password", {
            method: "POST",
            body: JSON.stringify({ password: probe }),
        }).catch((e: Error) => e);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("admin_password: Field required");
        expect((error as Error).message).not.toContain(probe);
    });
});

describe("setPassword contract", () => {
    it("sends admin_password and password, the names the ops API requires", async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 204 });
        const { usersApi } = await import("../users");
        await usersApi.setPassword("u1", "new-pass-value", "admin-pass-value", "tok");
        const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
        expect(JSON.parse(init.body as string)).toEqual({
            admin_password: "admin-pass-value",
            password: "new-pass-value",
        });
    });
});
