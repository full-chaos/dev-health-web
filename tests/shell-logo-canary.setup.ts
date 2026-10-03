import { test as setup } from "@playwright/test";
import { expectShellLogoAnswered, SHELL_LOGO_TIMEOUT_MS } from "./helpers/shell-logo";

// CHAOS-8538: runs as a dependency of the `authenticated` project, so it runs
// in each shard, after `auth-setup` and before the first signed-in test. When
// the web server does not answer the app-shell logo, this fails in 10 s with
// the URL in the message and the `authenticated` project does not start.
// Without it, each test of that project that waits for `load` ran into its
// 30 s timeout, three tries each.
setup("the web server answers the app-shell logo", async ({ page }) => {
    // "domcontentloaded" on purpose: the default `load` wait is the wait that
    // a logo request with no response never completes.
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expectShellLogoAnswered(page, SHELL_LOGO_TIMEOUT_MS);
});
