import { describe, expect, it } from "vitest";

import {
    arrayToRecord,
    recordToArray,
    validateProviderEntries,
    type ProviderEntry,
} from "./providerIdentityUtils";

describe("recordToArray / arrayToRecord", () => {
    it("round-trips a provider_identities record through the editable row list", () => {
        const record = { github: ["octocat"], gitlab: ["glcat"] };

        const entries = recordToArray(record);
        expect(entries).toHaveLength(2);
        expect(entries.map(({ provider, username }) => ({ provider, username }))).toEqual([
            { provider: "github", username: "octocat" },
            { provider: "gitlab", username: "glcat" },
        ]);

        expect(arrayToRecord(entries)).toEqual(record);
    });

    it("drops empty/whitespace-only usernames when building the record", () => {
        const entries: ProviderEntry[] = [
            { id: "a", provider: "github", username: "  octocat  " },
            { id: "b", provider: "github", username: "   " },
        ];

        expect(arrayToRecord(entries)).toEqual({ github: ["octocat"] });
    });
});

describe("validateProviderEntries", () => {
    it("passes for distinct, non-empty provider+username rows", () => {
        const entries: ProviderEntry[] = [
            { id: "a", provider: "github", username: "octocat" },
            { id: "b", provider: "gitlab", username: "octocat" },
        ];

        expect(validateProviderEntries(entries)).toEqual({ ok: true });
    });

    it("blocks on an empty username with a user-safe message", () => {
        const entries: ProviderEntry[] = [{ id: "a", provider: "github", username: "  " }];

        const result = validateProviderEntries(entries);
        if (result.ok) throw new Error("expected validation to fail");
        expect(result.message).toMatch(/username/iu);
    });

    it("blocks on a case-insensitive duplicate provider+username pair", () => {
        const entries: ProviderEntry[] = [
            { id: "a", provider: "github", username: "octocat" },
            { id: "b", provider: "github", username: "OctoCat" },
        ];

        const result = validateProviderEntries(entries);
        if (result.ok) throw new Error("expected validation to fail");
        expect(result.message).toMatch(/duplicate/iu);
    });

    it("allows the same username across different providers", () => {
        const entries: ProviderEntry[] = [
            { id: "a", provider: "github", username: "shared-name" },
            { id: "b", provider: "jira", username: "shared-name" },
        ];

        expect(validateProviderEntries(entries)).toEqual({ ok: true });
    });
});
