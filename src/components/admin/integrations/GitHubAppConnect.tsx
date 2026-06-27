import { CTA_LABELS } from "@/lib/design/cta";
import { connectGitHubHref } from "@/lib/onboarding/setupSurface";

export type GitHubAppConnectResult = "connected" | "error";

type GitHubAppConnectProps = {
    /** Result of a returning install callback, surfaced as a banner. */
    result?: GitHubAppConnectResult;
};

// Route the post-install callback toward the first-run sync surface (CHAOS-2681)
// so a fresh connect lands on "start your sync", not a dead credential page.
const INSTALL_HREF = connectGitHubHref();

/**
 * "Connect GitHub App" call-to-action for the GitHub integration page
 * (CHAOS-2235). Offers the frictionless, one-click GitHub App install that
 * sits alongside the manual personal-access-token form. The anchor points at
 * the server-side initiation route, which mints a signed install URL and
 * redirects the browser to GitHub.
 *
 * When the user returns from the install callback, `result` drives a
 * success/error banner so the outcome is visible without a toast.
 */
export function GitHubAppConnect({ result }: GitHubAppConnectProps) {
    return (
        <div className="mb-6 space-y-4">
            {result === "connected" && (
                <div
                    role="status"
                    className="rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-700"
                >
                    GitHub App connected. Repositories will sync using the installation
                    automatically.
                </div>
            )}
            {result === "error" && (
                <div
                    role="alert"
                    className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700"
                >
                    We couldn&apos;t connect the GitHub App. Please try again, or use a personal
                    access token below.
                </div>
            )}

            <div className="rounded-lg border border-(--border-subtle) bg-(--surface-base) p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-medium text-(--ink-base)">
                            {CTA_LABELS.connectGitHubApp}
                        </h2>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            One-click install — no tokens to paste. Authorize the GitHub App and
                            we&apos;ll handle credentials and per-installation rate limits for you.
                        </p>
                    </div>
                    <a
                        href={INSTALL_HREF}
                        className="inline-flex shrink-0 items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90 focus:outline-none focus:ring-2 focus:ring-(--surface-inverted) focus:ring-offset-2"
                    >
                        {CTA_LABELS.connectGitHubApp}
                    </a>
                </div>
            </div>
        </div>
    );
}
