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

// D6247: user ID only, no PII. E-mail, name, IP address and every other user key are dropped here, in
// every environment; the id is kept and still goes through the text scrub.
function keepUserIdOnly(event: { user?: object | undefined }): void {
    if (!event.user) return;
    const { id } = event.user as { id?: unknown };
    event.user = id === undefined ? {} : { id };
}

// The SDK builds a session item from the scope user (distinct id from id, then e-mail, then username; the
// IP address) and does not run the event hooks on it. The item is cut here: no distinct id, no IP address.
type SessionItem = { did?: unknown; ipAddress?: unknown; attrs?: Record<string, unknown> };

function dropSessionUser(session: SessionItem): void {
    delete session.did;
    delete session.ipAddress;
    if (session.attrs) delete session.attrs.ip_address;
}

const SESSION_PRIVACY_INTEGRATION: SentryIntegration = {
    name: "SessionUserPrivacy",
    setup(client) {
        client.on("beforeSendSession", (session) => dropSessionUser(session as SessionItem));
    },
};

type SentryInitOptions = Parameters<typeof Sentry.init>[0];
type IntegrationsOption = SentryInitOptions["integrations"];
type SentryIntegration = Exclude<
    NonNullable<IntegrationsOption>,
    (...args: never[]) => unknown
>[number];

function withSessionPrivacy(integrations: IntegrationsOption): IntegrationsOption {
    if (typeof integrations === "function") {
        return (defaults) => [...integrations(defaults), SESSION_PRIVACY_INTEGRATION];
    }
    return [...(integrations ?? []), SESSION_PRIVACY_INTEGRATION];
}

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

    keepUserIdOnly(event);
    return scrubTelemetryPayload(event);
}

type SentryTransactionEvent = Parameters<
    NonNullable<SentryInitOptions["beforeSendTransaction"]>
>[0];
type StaticSpanHook = Parameters<typeof Sentry.withStaticSpan>[0];
type SentrySpan = Parameters<StaticSpanHook>[0];

function scrubTransaction(event: SentryTransactionEvent): SentryTransactionEvent {
    keepUserIdOnly(event);
    return scrubTelemetryPayload(event);
}

function scrubSpan(span: SentrySpan): SentrySpan {
    return scrubTelemetryPayload(span);
}

const V10_DENY = ["forwarded", "-ip", "remote-", "via", "-user"];

// Explicit v10 defaults: v11 collects far more when dataCollection is unset.
export const V10_PRIVACY_BASELINE = {
    traceLifecycle: "static",
    attachStacktrace: false,
    dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: { deny: V10_DENY }, response: { deny: V10_DENY } },
        httpBodies: [],
        urlQueryParams: { deny: V10_DENY },
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        frameContextLines: 7,
        graphQL: { document: false, variables: false },
    },
} satisfies SentryInitOptions;

export function attachBeforeSend(config: SentryInitOptions): SentryInitOptions {
    const existingBeforeSend = config.beforeSend;
    const existingBeforeSendTransaction = config.beforeSendTransaction;
    const existingBeforeBreadcrumb = config.beforeBreadcrumb;
    const existingBeforeSendSpan = config.beforeSendSpan as StaticSpanHook | undefined;

    return {
        ...V10_PRIVACY_BASELINE,
        ...config,
        // Deep merge: a partial caller dataCollection must not drop the v10 defaults for the rest.
        dataCollection: { ...V10_PRIVACY_BASELINE.dataCollection, ...config.dataCollection },
        integrations: withSessionPrivacy(config.integrations),
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
        beforeSendSpan: Sentry.withStaticSpan((span: SentrySpan) => {
            const scrubbed = scrubSpan(span);
            return existingBeforeSendSpan ? existingBeforeSendSpan(scrubbed) : scrubbed;
        }),
        beforeBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint) {
            const scrubbed = scrubBreadcrumb(breadcrumb);
            return existingBeforeBreadcrumb ? existingBeforeBreadcrumb(scrubbed, hint) : scrubbed;
        },
    };
}
