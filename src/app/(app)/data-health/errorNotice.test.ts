/**
 * CHAOS-7677: the load-error box on the Connector Health and Mapping Coverage pages is the shared
 * `Notice` (danger), not a raw red box. The pages are async server components that need a session
 * and GraphQL; their source is read, as the page pins in `app/(app)` do.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (page: string) => readFileSync(join(__dirname, page, "page.tsx"), "utf-8");

describe.each(["connectors", "mapping"])("data-health/%s error box", (page) => {
    const source = read(page);

    it("is a danger Notice with one plain sentence and Retry, no backend text", () => {
        expect(source).toMatch(
            /<Notice variant="danger" live=\{false\} action=\{<RetryButton \/>\}>/u,
        );
        expect(source).toMatch(/could not be loaded\. Retry, or check again in a moment\./u);
        expect(source).not.toContain("{error}");
    });

    it("has no raw palette class", () => {
        expect(source).not.toMatch(/\b(?:text|bg|border)-(?:red|green|yellow|amber)-\d{2,3}/u);
    });
});
