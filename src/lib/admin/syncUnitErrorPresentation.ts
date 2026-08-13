export interface SyncUnitErrorPresentation {
    code: string | null;
    title: string;
    detail: string | null;
}

const KNOWN_SYNC_UNIT_ERRORS: Record<string, { title: string; detail: string }> = {
    provider_unit_exhausted: {
        title: "Provider retries exhausted",
        detail: "This unit used all retry attempts before it could complete.",
    },
    provider_unit_retryable: {
        title: "Provider request will retry",
        detail: "The provider request failed temporarily and will be tried again.",
    },
    provider_budget_contention: {
        title: "Waiting for provider capacity",
        detail: "Other provider work is using the available request capacity. This unit will resume automatically.",
    },
    budget_deferred: {
        title: "Waiting for sync budget",
        detail: "This unit is paused until sync capacity becomes available.",
    },
    budget_deferral_exhausted: {
        title: "Sync budget wait limit reached",
        detail: "This unit could not obtain sync capacity before its wait limit expired.",
    },
    deferral_exhausted: {
        title: "Sync deferral limit reached",
        detail: "This unit reached the maximum number of wait cycles before it could run.",
    },
    effect_recovery_ambiguous: {
        title: "Previous sync result could not be verified",
        detail: "The worker could not safely determine whether a previous write completed.",
    },
    rate_limit: {
        title: "Waiting for provider rate limit",
        detail: "The provider asked us to slow down. This unit will retry automatically.",
    },
    provider_error: {
        title: "Provider request failed",
        detail: "The provider returned an error while this unit was running.",
    },
    worker_lost: {
        title: "Worker stopped responding",
        detail: "The worker stopped before it reported a final result.",
    },
    soft_timeout: {
        title: "Provider request timed out",
        detail: "This unit exceeded its time limit and may retry.",
    },
    feature_disabled: {
        title: "Sync route is disabled",
        detail: "This dataset is not enabled for the current worker route.",
    },
    pagerduty_sync_disabled: {
        title: "PagerDuty sync is disabled",
        detail: "PagerDuty synchronization is disabled for this worker route.",
    },
    dispatch_denied: {
        title: "Sync dispatch was denied",
        detail: "The worker could not accept this unit for processing.",
    },
};

const MACHINE_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

function humanizeMachineCode(value: string): string {
    const words = value.replaceAll("_", " ");
    return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function clean(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export function getSyncUnitErrorPresentation(
    error: string | null | undefined,
    errorCategory: string | null | undefined,
): SyncUnitErrorPresentation {
    const cleanError = clean(error);
    const cleanCategory = clean(errorCategory);
    const code =
        cleanCategory ?? (cleanError && MACHINE_CODE_PATTERN.test(cleanError) ? cleanError : null);
    const known = code ? KNOWN_SYNC_UNIT_ERRORS[code] : undefined;

    if (known) {
        const detailedError =
            cleanError && cleanError !== code && !MACHINE_CODE_PATTERN.test(cleanError)
                ? cleanError
                : null;
        return {
            code,
            title: known.title,
            detail: detailedError ?? known.detail,
        };
    }

    if (code) {
        const detailedError =
            cleanError && cleanError !== code && !MACHINE_CODE_PATTERN.test(cleanError)
                ? cleanError
                : null;
        return {
            code,
            title: humanizeMachineCode(code),
            detail: detailedError,
        };
    }

    if (cleanError) {
        return { code: null, title: cleanError, detail: null };
    }

    return {
        code: null,
        title: "Sync unit needs attention",
        detail: null,
    };
}
