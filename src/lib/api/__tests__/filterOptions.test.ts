import { beforeEach, describe, expect, it, vi } from "vitest";

const getJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/apiClient", () => ({ apiClient: { getJson } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

import { fetchFilterNames, fetchTeamNames } from "../filterOptions";

describe("fetchTeamNames", () => {
    beforeEach(() => {
        getJson.mockReset();
    });

    it("returns the served team_names map", async () => {
        getJson.mockResolvedValue({ teams: ["ENG"], team_names: { ENG: "Engineering" } });
        await expect(fetchTeamNames()).resolves.toEqual({ ENG: "Engineering" });
        expect(getJson.mock.calls[0][0]).toBe("/api/v1/filters/options");
    });

    it("is empty when the API serves no names (older build or none held)", async () => {
        getJson.mockResolvedValue({ teams: ["ENG"] });
        await expect(fetchTeamNames()).resolves.toEqual({});
    });

    it("is empty when the read fails", async () => {
        getJson.mockRejectedValue(new Error("down"));
        await expect(fetchTeamNames()).resolves.toEqual({});
    });
});

describe("fetchFilterNames", () => {
    beforeEach(() => {
        getJson.mockReset();
    });

    it("returns the three served name maps, empty when absent", async () => {
        getJson.mockResolvedValue({ team_names: { T: "Platform" }, repo_names: { R: "api" } });
        await expect(fetchFilterNames()).resolves.toEqual({
            teams: { T: "Platform" },
            repos: { R: "api" },
            developers: {},
        });
    });

    it("is empty when the read fails", async () => {
        getJson.mockRejectedValue(new Error("down"));
        await expect(fetchFilterNames()).resolves.toEqual({ teams: {}, repos: {}, developers: {} });
    });
});
