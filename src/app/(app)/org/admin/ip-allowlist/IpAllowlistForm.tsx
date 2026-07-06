"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ReviewSummary, type ReviewSummaryRow } from "@/components/shared/ReviewSummary";
import { CTA_LABELS } from "@/lib/design/cta";
import type { IPAllowlist, IPAllowlistCreate, IPAllowlistUpdate } from "@/lib/admin/types";
import { CidrField } from "./CidrField";
import { currentIpCoveredByRule, validateIpOrCidrInput } from "./cidr";

type IpAllowlistFormMode = "create" | "edit";

type IpAllowlistFormProps = {
    mode: IpAllowlistFormMode;
    /** Required when `mode === "edit"`; ignored otherwise. */
    initialEntry?: IPAllowlist;
    /** The requesting admin's own apparent IP, or `null` if undetermined. */
    currentIp: string | null;
    isSaving: boolean;
    onSaveAction: (data: IPAllowlistCreate | IPAllowlistUpdate) => void;
    onCancelAction: () => void;
};

function toDatetimeLocalValue(iso: string | null | undefined): string {
    if (!iso) return "";
    return iso.slice(0, 16);
}

/**
 * Create/edit form for a single IP allowlist entry (CHAOS-2842). Validates
 * the CIDR/IP input before it can be saved, and — since a bad range here can
 * lock an admin out of their own console — requires an explicit acknowledgment
 * via {@link ConfirmDialog} whenever the range being saved would exclude the
 * requesting admin's own current IP.
 */
export function IpAllowlistForm({
    mode,
    initialEntry,
    currentIp,
    isSaving,
    onSaveAction,
    onCancelAction,
}: IpAllowlistFormProps) {
    const [ipRange, setIpRange] = useState(initialEntry?.ip_range ?? "");
    const [description, setDescription] = useState(initialEntry?.description ?? "");
    const [expiresAt, setExpiresAt] = useState(toDatetimeLocalValue(initialEntry?.expires_at));
    const [touched, setTouched] = useState(false);
    const [pendingLockoutConfirm, setPendingLockoutConfirm] = useState(false);

    const ipRangeError = touched ? validateIpOrCidrInput(ipRange) : null;

    // New entries are always active on the backend; edits keep the entry's
    // existing active state (toggling is handled separately by the table).
    const willBeActive = mode === "create" ? true : (initialEntry?.is_active ?? true);
    const coversCurrentIp = currentIpCoveredByRule(currentIp, ipRange);
    const showLockoutWarning = willBeActive && coversCurrentIp === false;

    function buildPayload(): IPAllowlistCreate | IPAllowlistUpdate {
        const trimmedDescription = description.trim();
        return {
            ip_range: ipRange.trim(),
            description: trimmedDescription || null,
            expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        };
    }

    function handleSaveClick() {
        setTouched(true);
        if (validateIpOrCidrInput(ipRange)) return;

        if (showLockoutWarning) {
            setPendingLockoutConfirm(true);
            return;
        }
        onSaveAction(buildPayload());
    }

    const reviewRows: ReviewSummaryRow[] = [
        { label: "IP range", value: ipRange.trim() || "--" },
        { label: "Your current IP", value: currentIp ?? "Unknown" },
        { label: "Description", value: description.trim() || "--" },
    ];

    return (
        <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-5">
            <div className="grid gap-4 sm:grid-cols-3">
                <CidrField
                    id="ip-range"
                    label="IP Range"
                    value={ipRange}
                    error={ipRangeError}
                    disabled={isSaving}
                    onChangeAction={setIpRange}
                />
                <div>
                    <label
                        htmlFor="ip-description"
                        className="mb-1 block text-xs font-medium text-(--ink-muted)"
                    >
                        Description
                    </label>
                    <input
                        id="ip-description"
                        type="text"
                        placeholder="Optional"
                        value={description ?? ""}
                        disabled={isSaving}
                        onChange={(event) => setDescription(event.target.value)}
                        className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                    />
                </div>
                <div>
                    <label
                        htmlFor="ip-expires"
                        className="mb-1 block text-xs font-medium text-(--ink-muted)"
                    >
                        Expires At
                    </label>
                    <input
                        id="ip-expires"
                        type="datetime-local"
                        value={expiresAt}
                        disabled={isSaving}
                        onChange={(event) => setExpiresAt(event.target.value)}
                        className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none"
                    />
                </div>
            </div>

            {showLockoutWarning ? (
                <div
                    role="alert"
                    className="mt-4 rounded-lg border border-(--caution)/30 bg-(--caution)/10 p-3 text-xs text-(--caution)"
                >
                    This range does not include your current IP address
                    {currentIp ? ` (${currentIp})` : ""}. If this is your only active rule, enabling
                    it may lock you out of the admin console.
                </div>
            ) : null}

            <div className="mt-4 flex gap-2">
                <button
                    type="button"
                    onClick={handleSaveClick}
                    disabled={isSaving}
                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    {isSaving ? CTA_LABELS.savingConfiguration : CTA_LABELS.save}
                </button>
                <button
                    type="button"
                    onClick={onCancelAction}
                    disabled={isSaving}
                    className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                    {CTA_LABELS.cancel}
                </button>
            </div>

            <ConfirmDialog
                isOpen={pendingLockoutConfirm}
                title="This rule may lock you out"
                tone="destructive"
                description={
                    <ReviewSummary
                        rows={reviewRows}
                        warnings={[
                            "Your current IP address is not covered by this range. If it is your only active rule, you may lose admin access from your current network.",
                        ]}
                    />
                }
                confirmLabel={CTA_LABELS.acknowledgeAndSave}
                isPending={isSaving}
                onConfirmAction={() => {
                    setPendingLockoutConfirm(false);
                    onSaveAction(buildPayload());
                }}
                onCancelAction={() => setPendingLockoutConfirm(false)}
            />
        </div>
    );
}
