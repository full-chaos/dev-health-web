import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_request", () => ({
    request: vi.fn(),
}));

import { request } from "../_request";
import { orgsApi } from "../orgs";
import { usersApi } from "../users";

const mockRequest = vi.mocked(request);

const row = (n: number) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` });
const page = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => row(from + i));

beforeEach(() => {
    mockRequest.mockReset();
});

describe("org and user lists ask for what the served route filters", () => {
    it("users: the list names its inactive rows (ops default is active_only=true)", async () => {
        mockRequest.mockResolvedValue([]);
        await usersApi.list("synthetic-token");
        const path = String(mockRequest.mock.calls[0][0]);
        expect(new URLSearchParams(path.split("?")[1] ?? "").get("active_only")).toBe("false");
    });

    it("orgs: the list names its inactive rows (ops default is active_only=true)", async () => {
        mockRequest.mockResolvedValue([]);
        await orgsApi.list("synthetic-token");
        const path = String(mockRequest.mock.calls[0][0]);
        expect(new URLSearchParams(path.split("?")[1] ?? "").get("active_only")).toBe("false");
    });

    it("control: the user search term still travels as q", async () => {
        mockRequest.mockResolvedValue([]);
        await usersApi.list("synthetic-token", undefined, "alice");
        const path = String(mockRequest.mock.calls[0][0]);
        expect(new URLSearchParams(path.split("?")[1] ?? "").get("q")).toBe("alice");
    });

    it("control: a short served list is returned as is", async () => {
        mockRequest.mockResolvedValue(page(0, 3));
        const all = await usersApi.list("synthetic-token");
        expect(all).toHaveLength(3);
    });
});
