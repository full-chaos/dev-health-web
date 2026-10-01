import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("superadmin class mappings", () => {
    it("the overview stats and the org members error use theme tokens", () => {
        const page = src("app/(app)/superadmin/page.tsx");
        // The red-50 error card on this page is a banner: it waits for `Notice` `danger`.
        const withoutBanner = page
            .split("\n")
            .filter((l) => !/border-red-\d+ bg-red-\d+/u.test(l))
            .join("\n");
        expect(withoutBanner).not.toMatch(/\b(?:text|bg)-(?:purple|green|red)-\d{2,3}/u);
        expect(page).toContain("text-(--positive)");
        expect(src("app/(app)/superadmin/orgs/[id]/page.tsx")).not.toMatch(/text-red-\d{2,3}/u);
    });
});
