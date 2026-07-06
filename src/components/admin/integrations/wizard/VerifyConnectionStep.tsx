import { CTA_LABELS } from "@/lib/design/cta";
import { PrerequisiteCallout } from "@/components/admin/sync/config-form/PrerequisiteCallout";

type VerifyConnectionStepProps = {
    /** True for the github_app method — the backend verifies on install-callback. */
    isRedirect: boolean;
    isPending: boolean;
    testResult: { success: boolean; message: string } | null;
    onVerifyAction: () => void;
};

/**
 * Verify-connection step (CHAOS-2837 AC3): runs `testConnection` against the
 * captured (not-yet-persisted) credential fields before the review step
 * offers to save. Never renders for the `github_app` method — that
 * credential is verified atomically by the backend during the install
 * round-trip.
 */
export function VerifyConnectionStep({
    isRedirect,
    isPending,
    testResult,
    onVerifyAction,
}: VerifyConnectionStepProps) {
    if (isRedirect) {
        return (
            <div className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Verify connection</h2>
                <PrerequisiteCallout
                    title="Verified automatically"
                    description="GitHub App installs are verified by GitHub during the install step you just completed."
                />
            </div>
        );
    }

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
