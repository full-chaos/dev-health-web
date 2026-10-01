import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const RAW =
    /\b(?:text|bg|border|fill)-(?:red|orange|amber|yellow|green|emerald|blue|indigo|purple|gray|slate)-\d{2,3}/u;

describe("org admin class mappings", () => {
    it("provider logos on the integrations page use theme tokens", () => {
        const s = src("app/(app)/org/admin/integrations/page.tsx");
        expect(s).not.toMatch(/<svg[^>]*(?:text|fill)-(?:gray|orange|blue|indigo|emerald)-/u);
        expect(s).toContain("fill-current text-foreground");
    });
    it("status chips and delete buttons use status tokens", () => {
        for (const f of [
            "app/(app)/org/admin/users/[id]/page.tsx",
            "app/(app)/org/admin/ip-allowlist/IpAllowlistTable.tsx",
            "app/(app)/org/admin/retention/RetentionPolicyTable.tsx",
            "app/(app)/org/admin/users/[id]/DeleteUserButton.tsx",
            "components/admin/settings/DangerZone.tsx",
            "components/settings/SettingsSection.tsx",
        ]) {
            expect(src(f), f).not.toMatch(RAW);
        }
        expect(src("components/admin/settings/DangerZone.tsx")).toContain(
            "text-(--accent-foreground)",
        );
    });
    it("the settings danger section has no dark: palette variants", () => {
        expect(src("components/settings/SettingsSection.tsx")).not.toMatch(/dark:/u);
    });
});
