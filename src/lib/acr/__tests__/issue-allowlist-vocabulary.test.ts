// A `*` credential takes its repositories from the acr.credential.issue allowlist (ops scope.go:20-50 at the live
// vendor pin 5389c1f1). That list equals the grant set a repository read decides only while every organization role
// that holds a read action also holds acr.credential.issue: the PDP filters grant rows by roleHolds(role, action).
// The files under testdata/ops-5389c1f1 are byte copies of ops contracts/auth/v1 at that pin.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = new URL("./testdata/ops-5389c1f1/", import.meta.url);
const PINNED: Readonly<Record<string, string>> = {
    "decision-invalid-allowlist-over-the-bound.json":
        "807664d5352391f676694e2f742921d7841b3ef99d07931cc62741ba9ef51d72",
    "decision-valid-allow-allowlist-several-keys.json":
        "ad9ced87be097609cbce26768a4f517a2f36eaab5f60f4f2cf970f8655302c04",
    "decision-valid-allowlist-at-the-bound.json":
        "53e75ee7f6059791ed1e861485627ffa5e936f3b1d2893e8e2536ba1dce3d120",
    "decision-valid-allow-allowlist-wildcard.json":
        "021f7523f972eed8901e4d73eb3a1fba33f02b0ec43ec6bf4c73a45ef2030526",
    "decision-valid-allowlist-nested-keys.json":
        "6b96d4666eca1abb5b4e6e7ffa3abefdc0bc2213d6d394724de3537422ba9512",
    "decision-valid-empty-allowlist.json":
        "63b0e983f29cd44b985ac7addf2bb54cfdc511dfd3139cce474752f83b4e5465",
    "decision-valid-reason-repository-allowlist-too-large.json":
        "c40393a0fc76de951d0bfaab83a5835fdb5e2c14adb3a621300ec54a7c5331fa",
    "roles.v1.json": "8c1ec5927b7b77ea5bde9997525faac3c9a800722a4d4173155db66a4660c985",
};
const READ_ACTIONS = ["acr.context.read", "acr.evidence.read"];
const ISSUE_ACTION = "acr.credential.issue";

type Role = { role: string; scope: string; actions: string[] };

function roles(): Role[] {
    const doc = JSON.parse(readFileSync(new URL("roles.v1.json", DIR), "utf8")) as {
        roles: Role[];
    };
    return doc.roles;
}

describe("the vendored ops vocabulary the issue allowlist rests on", () => {
    it.each(Object.entries(PINNED))("%s is the byte copy pinned at ops 5389c1f1", (name, sha) => {
        const bytes = readFileSync(new URL(name, DIR));
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha);
    });

    it("Given every organization role that holds a repository read action, then it also holds acr.credential.issue", () => {
        const organizationRoles = roles().filter((r) => r.scope === "organization");
        expect(organizationRoles.map((r) => r.role)).toEqual([
            "viewer",
            "member",
            "admin",
            "owner",
        ]);
        const drift = organizationRoles
            .filter((r) => READ_ACTIONS.some((a) => r.actions.includes(a)))
            .filter((r) => !r.actions.includes(ISSUE_ACTION))
            .map((r) => r.role);
        expect(drift).toEqual([]);
    });
});
