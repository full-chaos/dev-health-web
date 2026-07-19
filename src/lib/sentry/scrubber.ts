import * as Sentry from "@sentry/nextjs";
import type { Breadcrumb, BreadcrumbHint, ErrorEvent, EventHint } from "@sentry/nextjs";
import {
    isSensitiveQueryParameterName,
    scrubTelemetryPayload,
    scrubTelemetryText,
} from "./scrubber-value";

export { scrubTelemetryUrl } from "./scrubber-value";

const SENSITIVE_URL_PATTERN = /\/(auth|admin\/credentials)/;
const SENSITIVE_REQUEST_HEADER_NAMES = ["authorization", "cookie", "x-csrf-token"] as const;

function isSensitiveRequestHeaderName(value: string): boolean {
    return SENSITIVE_REQUEST_HEADER_NAMES.some((name) => name === value.toLowerCase());
}

type QueryString = NonNullable<NonNullable<ErrorEvent["request"]>["query_string"]>;

function scrubQueryString(queryString: QueryString): QueryString {
    if (typeof queryString === "string") return scrubTelemetryText(queryString);

    if (Array.isArray(queryString)) {
        const scrubbed: Array<[string, string]> = [];
        for (const [key, value] of queryString) {
            scrubbed.push([
                key,
                isSensitiveQueryParameterName(key) ? "[Filtered]" : scrubTelemetryText(value),
            ]);
        }
        return scrubbed;
    }

    return Object.fromEntries(
        Object.entries(queryString).map(([key, value]) => [
            key,
            isSensitiveQueryParameterName(key) ? "[Filtered]" : scrubTelemetryText(value),
        ]),
    );
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
    return scrubTelemetryPayload(breadcrumb);
}

export function scrubReplayRecordingEvent<RecordingEvent extends object>(
    event: RecordingEvent,
): RecordingEvent {
    return scrubTelemetryPayload(event);
}

export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
    if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
            event.request.headers = Object.fromEntries(
                Object.entries(event.request.headers).filter(
                    ([key]) => !isSensitiveRequestHeaderName(key),
                ),
            );
        }
        if (event.request.query_string)
            event.request.query_string = scrubQueryString(event.request.query_string);
        if (SENSITIVE_URL_PATTERN.test(event.request.url ?? "")) {
            delete event.request.data;
        }
    }

    const isProduction = process.env.NODE_ENV === "production";
    const includeIp = process.env.SENTRY_INCLUDE_IP === "true";
    if (isProduction && !includeIp && event.user) {
        delete event.user.ip_address;
    }

    return scrubTelemetryPayload(event);
}

type SentryInitOptions = Parameters<typeof Sentry.init>[0];
type SentryTransactionEvent = Parameters<
    NonNullable<SentryInitOptions["beforeSendTransaction"]>
>[0];
type SentrySpan = Parameters<NonNullable<SentryInitOptions["beforeSendSpan"]>>[0];

function scrubTransaction(event: SentryTransactionEvent): SentryTransactionEvent {
    return scrubTelemetryPayload(event);
}

function scrubSpan(span: SentrySpan): SentrySpan {
    return scrubTelemetryPayload(span);
}

export function attachBeforeSend(config: SentryInitOptions): SentryInitOptions {
    const existingBeforeSend = config.beforeSend;
    const existingBeforeSendTransaction = config.beforeSendTransaction;
    const existingBeforeBreadcrumb = config.beforeBreadcrumb;
    const existingBeforeSendSpan = config.beforeSendSpan;

    return {
        ...config,
        beforeSend(event: ErrorEvent, hint: EventHint) {
            const scrubbed = scrubEvent(event, hint);
            if (scrubbed === null) return null;
            return existingBeforeSend ? existingBeforeSend(scrubbed, hint) : scrubbed;
        },
        beforeSendTransaction(event: SentryTransactionEvent, hint: EventHint) {
            const scrubbed = scrubTransaction(event);
            return existingBeforeSendTransaction
                ? existingBeforeSendTransaction(scrubbed, hint)
                : scrubbed;
        },
        beforeSendSpan(span: SentrySpan) {
            const scrubbed = scrubSpan(span);
            return existingBeforeSendSpan ? existingBeforeSendSpan(scrubbed) : scrubbed;
        },
        beforeBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint) {
            const scrubbed = scrubBreadcrumb(breadcrumb);
            return existingBeforeBreadcrumb ? existingBeforeBreadcrumb(scrubbed, hint) : scrubbed;
        },
    };
}
