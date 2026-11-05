import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORG_IMPERSONATION_DENIED_ACTIONS, PLATFORM_ACTIONS } from "../actionTable";

const doc = readFileSync(join(process.cwd(), "docs/auth-impersonation.md"), "utf8");

describe("docs/auth-impersonation.md", () => {
    it.each([...PLATFORM_ACTIONS, ...ORG_IMPERSONATION_DENIED_ACTIONS])("lists `%s`", (action) => {
        expect(doc).toContain(`\`${action}\``);
    });

    it("names the switch values", () => {
        for (const v of ["`off`", "`shadow`", "`enforce`", "AUTHZ_PLATFORM_UI"]) {
            expect(doc).toContain(v);
        }
    });

    it("is linked from the env and auth docs", () => {
        for (const f of ["docs/env-vars.md", "docs/auth-system.md"]) {
            expect(readFileSync(join(process.cwd(), f), "utf8")).toContain("auth-impersonation.md");
        }
    });
});
