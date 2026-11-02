import { beforeAll } from "vitest";

/**
 * The panel loads ask-dev's render with `next/dynamic` on its first open, so a test sees "Loading Ask
 * Dev…" until that import ends. Testing Library waits 1 s. The import took 166 ms on an idle host and
 * up to about 3 s on a starved one, on main and on CHAOS-12474 alike, and one starved CI run failed
 * every test of a file on this race: the first wait ran out, and the rest then read the composer at
 * once. A test file that opens the panel and has no static import of the render calls this at its
 * top level, so it waits for the import itself, not for a clock. The hook's limit only makes a load
 * that never ends fail by name.
 */
export function preloadAskDevRender(): void {
    beforeAll(async () => {
        await import("@/components/ask-dev/AskDevRender");
    }, 60_000);
}
