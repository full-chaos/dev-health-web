import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const RAW =
    /\b(?:text|bg|border|fill)-(?:red|orange|amber|yellow|green|emerald|blue|indigo|purple|gray|slate)-\d{2,3}/u;

describe("org admin class mappings", () => {
    it("provider logos keep their brand marks and carry no status token", () => {
        const s = src("app/(app)/org/admin/integrations/page.tsx");
        const logos = s.match(/<svg[^>]*fill-current[^>]*>/gu) ?? [];
        expect(logos.length).toBeGreaterThanOrEqual(5);
        for (const logo of logos) {
            expect(logo).not.toMatch(/text-\(--(?:positive|negative|caution|info)\)/u);
        }
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
        // CHAOS-8241: the Delete Organization button is an outline button (design), so the status token
        // is on its border and text, not a filled background.
        expect(src("components/admin/settings/DangerZone.tsx")).toContain("border-(--negative)");
    });
    it("the settings danger section has no dark: palette variants", () => {
        expect(src("components/settings/SettingsSection.tsx")).not.toMatch(/dark:/u);
    });
});
