import { CTA_LABELS } from "@/lib/design/cta";

type VerifyConnectionStepProps = {
    isPending: boolean;
    testResult: { success: boolean; message: string } | null;
    onVerifyAction: () => void;
};

/**
 * Verify-connection step (CHAOS-2837 AC3): runs `testConnection` against the
 * captured (not-yet-persisted) credential fields before the review step
 * offers to save. This step is never reachable for the `github_app` method —
 * `getVisibleAddProviderSteps` drops `verify`/`review` entirely for that
 * redirect method, since the backend verifies the credential atomically
 * during the install round-trip and the `credential` step's install CTA is
 * the terminal step instead.
 */
export function VerifyConnectionStep({
    isPending,
    testResult,
    onVerifyAction,
}: VerifyConnectionStepProps) {
    return (
        <div className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Verify connection</h2>
            <p className="text-xs text-(--ink-muted)">
                Test the credential you just entered before saving it.
            </p>
            <button
                type="button"
                onClick={onVerifyAction}
                disabled={isPending}
                className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-foreground hover:bg-(--card-70) disabled:opacity-50"
            >
                {isPending ? "Testing…" : CTA_LABELS.verifyConnection}
            </button>
            {testResult && (
                <p
                    role={testResult.success ? "status" : "alert"}
                    className={`text-sm ${testResult.success ? "text-(--positive)" : "text-(--negative)"}`}
                >
                    {testResult.success ? "✓" : "✕"} {testResult.message}
                </p>
            )}
        </div>
    );
}
