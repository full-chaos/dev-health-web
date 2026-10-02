import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The visible Beta mark is gone everywhere (ruling 30). The shell and marketing renders are tested in
// their own files; these source checks cover the auth layout, the shell chrome where a badge could
// come back (top bar, sidebar, mobile bar).
const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

describe("no Beta badge", () => {
    it("the component is deleted", () => {
        expect(existsSync(new URL("../BetaBadge.tsx", import.meta.url))).toBe(false);
    });

    it.each([
        "app/(auth)/layout.tsx",
        "components/shell/ShellTopBar.tsx",
        "components/shell/ShellSidebar.tsx",
        "components/shell/ShellMobileBar.tsx",
    ])("%s renders no Beta mark", (file) => {
        expect(read(file)).not.toMatch(/BetaBadge|>\s*Beta\s*</);
    });
});
