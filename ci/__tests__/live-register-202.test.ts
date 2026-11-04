import { describe, expect, it, vi } from "vitest";

vi.mock("@playwright/test", () => ({ expect: () => undefined, test: { skip: () => undefined } }));

import {
    REGISTER_ACCEPTED_STATUS,
    provisionUser,
    registerStatusFault,
    setupUser,
} from "../../tests/live/helpers";

/**
 * CHAOS-11082: every register site of the live tier asserts the one 202 answer strictly. ops
 * answers 202 on every register route (and no backend answers 201), so a 200 or a 201 is a fault.
 */

type Reply = { status: number; body?: unknown };

function fakeRequest(registerStatus: number) {
    const calls: string[] = [];
    const answer = (method: string) => async (url: string) => {
        const call = `${method} ${new URL(url).pathname}`;
        calls.push(call);
        const reply: Reply =
            call === "POST /api/v1/auth/register"
                ? { status: registerStatus, body: { message: "ok" } }
                : { status: 500 };
        const text = JSON.stringify(reply.body ?? {});
        return {
            status: () => reply.status,
            ok: () => reply.status >= 200 && reply.status < 300,
            text: async () => text,
            json: async () => JSON.parse(text) as unknown,
        };
    };
    return { request: { post: answer("POST"), get: answer("GET"), patch: answer("PATCH") }, calls };
}

describe("registerStatusFault", () => {
    it("accepts 202 only", () => {
        expect(REGISTER_ACCEPTED_STATUS).toBe(202);
        expect(registerStatusFault(202)).toBe("");
        for (const status of [200, 201, 204, 400, 409, 422, 429, 500]) {
            expect(registerStatusFault(status)).toBe(
                `register answered ${String(status)}, want 202`,
            );
        }
    });
});

describe("setupUser and provisionUser stop at a register answer that is not 202", () => {
    const user = { email: "a@example.com", password: "TestPass123!", fullName: "A" };

    it("201 gives no token and no later step (control: 202 goes on)", async () => {
        const created = fakeRequest(201);
        const setup = await setupUser(created.request as never, user);
        expect(setup.token).toBe("");
        expect(created.calls).toEqual(["POST /api/v1/auth/register"]);
        expect(setup.steps[0]).toMatch(/^register 201 /u);

        const accepted = fakeRequest(202);
        await setupUser(accepted.request as never, user);
        expect(accepted.calls.length).toBeGreaterThan(1);
    });

    it("provisionUser gives no id on 201 and goes on at 202", async () => {
        const created = fakeRequest(201);
        expect(await provisionUser(created.request as never, "su-token", "p")).toBe("");
        expect(created.calls).toEqual(["POST /api/v1/auth/register"]);

        const accepted = fakeRequest(202);
        await provisionUser(accepted.request as never, "su-token", "p");
        expect(accepted.calls.length).toBeGreaterThan(1);
    });
});
