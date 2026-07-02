"use client";

import { useRef, useState, useTransition } from "react";
import { validateCustomerPushPayload } from "@/lib/admin/server";
import { buildSamplePayload } from "@/lib/customer-push/sample-payload";
import { RejectedRecordsTable } from "./RejectedRecordsTable";
import { CTA_LABELS } from "@/lib/design/cta";
import type { CustomerPushSystem, CustomerPushValidateResponse } from "@/lib/admin/types";

type ValidatePayloadPanelProps = {
    sourceId: string;
    sourceSystem: CustomerPushSystem;
    sourceInstance: string;
    /** Test seam only — pages must not override the module default. */
    validateProxyAvailable?: boolean;
};

type Mode = "paste" | "upload" | "sample";

/**
 * The admin validate proxy (`POST .../sources/{id}/validate`) landed with
 * ops CHAOS-2695 (wave 4), so the interim hard-gate on the submit path is
 * lifted. The gate machinery (this flag + the `validateProxyAvailable` test
 * seam) is kept rather than deleted so a rollback is a one-line flip, and
 * unit tests can still exercise the gated-off state.
 */
export const VALIDATE_PROXY_AVAILABLE = true;

/**
 * Screen 5 — VALIDATE ONLY in v1. The console-push proxy
 * (`POST .../sources/{id}/batches`, producer="web-console") was overruled
 * post-critique (CC25 product decision): the ingestion write path stays
 * exclusively token-authed. There is deliberately no "Push this payload" CTA
 * here — only `POST .../sources/{id}/validate`.
 *
 * The ops endpoint returns 200 `valid: false` result rows even for
 * envelope-level failures (see ops
 * docs/architecture/external-ingest-idempotency-ownership.md), matching the
 * MSW mock contract this panel was built against.
 */
export function ValidatePayloadPanel({
    sourceId,
    sourceSystem,
    sourceInstance,
    validateProxyAvailable = VALIDATE_PROXY_AVAILABLE,
}: ValidatePayloadPanelProps) {
    const [mode, setMode] = useState<Mode>("paste");
    const [payloadText, setPayloadText] = useState("");
    const [parseError, setParseError] = useState<string | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);
    const [result, setResult] = useState<CustomerPushValidateResponse | null>(null);
    const [isPending, startTransition] = useTransition();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetOutcome = () => {
        setParseError(null);
        setApiError(null);
        setResult(null);
    };

    const handleModeChange = (next: Mode) => {
        setMode(next);
        resetOutcome();
        if (next === "sample") {
            setPayloadText(
                JSON.stringify(buildSamplePayload(sourceSystem, sourceInstance), null, 2),
            );
        } else if (next === "paste") {
            setPayloadText("");
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        setPayloadText(text);
        resetOutcome();
    };

    const handleValidate = () => {
        if (!validateProxyAvailable) return;
        resetOutcome();

        let parsed: unknown;
        try {
            parsed = JSON.parse(payloadText);
        } catch {
            setParseError("This isn't valid JSON. Check for a trailing comma or unclosed brace.");
            return;
        }

        startTransition(async () => {
            const response = await validateCustomerPushPayload(sourceId, parsed);
            if (response.error) {
                setApiError(response.error);
                return;
            }
            if (response.data) {
                setResult(response.data);
            }
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-2 border-b border-(--card-stroke)">
                {(["paste", "upload", "sample"] as Mode[]).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => handleModeChange(m)}
                        className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                            mode === m
                                ? "border-(--accent) text-foreground"
                                : "border-transparent text-(--ink-muted) hover:text-foreground"
                        }`}
                    >
                        {m === "paste"
                            ? "Paste JSON"
                            : m === "upload"
                              ? "Upload file"
                              : "Use sample"}
                    </button>
                ))}
            </div>

            {mode === "upload" && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    onChange={handleFileUpload}
                    className="block text-sm text-(--ink-muted)"
                />
            )}

            <textarea
                value={payloadText}
                onChange={(e) => {
                    setPayloadText(e.target.value);
                    resetOutcome();
                }}
                rows={12}
                placeholder='{"schemaVersion": "external-ingest.v1", "records": [...]}'
                className="w-full rounded-md border border-(--border-subtle) bg-(--surface-base) p-3 font-mono text-xs text-(--ink-base) focus:border-(--accent) focus:outline-none"
            />

            {parseError && <p className="text-sm text-red-500">{parseError}</p>}

            {!validateProxyAvailable && (
                <div
                    role="status"
                    className="rounded-lg border border-(--card-stroke) bg-(--surface-base) p-4 text-sm text-(--ink-muted)"
                >
                    Server-side validation isn&apos;t available yet — it arrives with the validation
                    endpoint (CHAOS-2695). You can prepare and inspect payloads here, or validate
                    from CI with <code>dev-hops push validate</code>.
                </div>
            )}

            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={handleValidate}
                    disabled={
                        !validateProxyAvailable || isPending || payloadText.trim().length === 0
                    }
                    className="inline-flex items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90 disabled:opacity-50"
                >
                    {isPending ? "Validating..." : CTA_LABELS.validatePayload}
                </button>
            </div>

            {apiError && (
                <div
                    role="alert"
                    className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500"
                >
                    Validation request failed: {apiError}
                </div>
            )}

            {result && (
                <div className="space-y-4">
                    {result.valid ? (
                        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6">
                            <p className="text-sm font-medium text-green-600">
                                Payload is valid — {result.items_accepted} record
                                {result.items_accepted === 1 ? "" : "s"} would be accepted.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
                            <p className="text-sm font-medium text-red-600">
                                {result.items_rejected} record
                                {result.items_rejected === 1 ? "" : "s"} rejected,{" "}
                                {result.items_accepted} would be accepted.
                            </p>
                        </div>
                    )}
                    <RejectedRecordsTable records={result.errors} />
                </div>
            )}
        </div>
    );
}
