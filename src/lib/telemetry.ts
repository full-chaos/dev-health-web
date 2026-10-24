import { getLocalStorage, getWindow } from "@/lib/env";
import { logger } from "@/lib/logger";

import {
    consoleTelemetryAdapter,
    firstPartyTelemetryAdapter,
    type TelemetryAdapter,
} from "./telemetry/adapters";
import { TELEMETRY_INTERACTION_EVENT } from "./telemetry/interaction";
import { canTrackProductTelemetry } from "./telemetry/config";
import { createTelemetryQueue, type TelemetryQueue } from "./telemetry/queue";
import { routePatternForPathname } from "./telemetry/routePatterns";
import { sanitizeTelemetryPayload } from "./telemetry/sanitize";
import { applyTelemetrySchema, closedRoutePattern, closeTelemetryEvent } from "./telemetry/schema";
import type { TelemetryEvent, TelemetryEventName, TelemetryPayloadByName } from "./telemetry/types";

const DEFAULT_SESSION_ID_KEY = "devhealth-product-telemetry-session-id";
const SESSION_LAST_ACTIVITY_KEY = "devhealth-product-telemetry-session-last-activity";
export const TELEMETRY_SESSION_IDLE_MS = 30 * 60 * 1000;
const DEFAULT_ANONYMOUS_USER_ID_KEY = "devhealth-product-telemetry-anonymous-user-id";

const INTERACTION_EVENT_NAMES: ReadonlySet<TelemetryEventName> = new Set([
    "filter_changed",
    "chart_interacted",
    "navigation_interacted",
    "guide_opened",
]);

type TelemetryContext = {
    sessionId?: string;
    anonymousUserId?: string;
    orgIdHash?: string | null;
    routePattern?: string | null;
};

type TelemetryConfiguration = {
    adapters?: TelemetryAdapter[];
    maxBatchSize?: number;
    flushIntervalMs?: number;
};

const defaultTelemetryConfiguration = {
    adapters: [firstPartyTelemetryAdapter, consoleTelemetryAdapter],
    maxBatchSize: 10,
    flushIntervalMs: 10_000,
};

let telemetryContext: TelemetryContext = {};
let telemetryQueue: TelemetryQueue | null = null;
let telemetryConfiguration: Required<TelemetryConfiguration> = defaultTelemetryConfiguration;

let fallbackIdCounter = 0;

function uuidFromRandomBytes(bytes: Uint8Array): string {
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

const randomId = () => {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.randomUUID) {
        return cryptoApi.randomUUID();
    }
    if (cryptoApi?.getRandomValues) {
        return uuidFromRandomBytes(cryptoApi.getRandomValues(new Uint8Array(16)));
    }
    fallbackIdCounter += 1;
    return `telemetry-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
};

function storedId(key: string): string {
    try {
        const storage = getLocalStorage();
        if (!storage) {
            return randomId();
        }
        const existing = storage.getItem(key);
        if (existing) {
            return existing;
        }
        const next = randomId();
        storage.setItem(key, next);
        return next;
    } catch {
        return randomId();
    }
}

// Used only when localStorage is missing or throws; keeps one id per page life.
let memorySession: { id: string; lastActivity: number } | null = null;

/**
 * Session id shared by all tabs of a browser. It changes when more than
 * TELEMETRY_SESSION_IDLE_MS passed since the last queued event; each call
 * counts as activity.
 */
function activeSessionId(now: number): string {
    let storage: Storage | undefined;
    try {
        storage = getLocalStorage();
    } catch {
        storage = undefined;
    }
    let id: string | null = null;
    let last: number | null = null;
    let stored = false;
    if (storage) {
        try {
            id = storage.getItem(DEFAULT_SESSION_ID_KEY) || null;
            const raw = storage.getItem(SESSION_LAST_ACTIVITY_KEY);
            const parsed = raw === null ? Number.NaN : Number(raw);
            last = Number.isFinite(parsed) ? parsed : null;
            stored = true;
        } catch {
            stored = false;
        }
    }
    if (!stored) {
        id = memorySession?.id ?? null;
        last = memorySession?.lastActivity ?? null;
    }
    // A missing last-activity time (id from before this change) counts as active.
    const idle = id !== null && last !== null && now - last > TELEMETRY_SESSION_IDLE_MS;
    if (!id || idle) {
        id = randomId();
    }
    memorySession = { id, lastActivity: now };
    if (storage) {
        try {
            storage.setItem(DEFAULT_SESSION_ID_KEY, id);
            storage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
        } catch {
            // Keep working with the in-memory copy.
        }
    }
    return id;
}

function getTelemetryQueue(): TelemetryQueue {
    if (!telemetryQueue) {
        telemetryQueue = createTelemetryQueue(telemetryConfiguration);
    }
    return telemetryQueue;
}

export function configureTelemetry(configuration: TelemetryConfiguration): void {
    telemetryQueue?.dispose();
    telemetryQueue = null;
    telemetryConfiguration = {
        adapters: configuration.adapters ?? defaultTelemetryConfiguration.adapters,
        maxBatchSize: configuration.maxBatchSize ?? defaultTelemetryConfiguration.maxBatchSize,
        flushIntervalMs:
            configuration.flushIntervalMs ?? defaultTelemetryConfiguration.flushIntervalMs,
    };
}

export function setTelemetryContext(context: TelemetryContext): void {
    telemetryContext = { ...telemetryContext, ...context };
}

export async function flushTelemetryEvents(): Promise<void> {
    await telemetryQueue?.flush();
}

/** Send queued events now, synchronously; for `pagehide` / hidden. Never throws. */
export function flushTelemetryEventsOnHide(): void {
    try {
        telemetryQueue?.flushOnHide();
    } catch {
        // Telemetry must never break the page while it unloads.
    }
}

export function resetTelemetryForTests(): void {
    telemetryQueue?.dispose();
    telemetryQueue = null;
    telemetryContext = {};
    telemetryConfiguration = defaultTelemetryConfiguration;
    memorySession = null;
}

/** The ids every ingested event needs, from the same sources trackTelemetryEvent uses; synchronous, so a beacon path can call it. */
export function telemetryEnvelopeIdentity(now: number): {
    eventId: string;
    sessionId: string;
    anonymousUserId: string;
    routePattern: string | null;
} {
    const win = getWindow();
    const pattern =
        telemetryContext.routePattern ??
        (win ? routePatternForPathname(win.location.pathname) : null);
    return {
        eventId: randomId(),
        sessionId: telemetryContext.sessionId ?? activeSessionId(now),
        anonymousUserId:
            telemetryContext.anonymousUserId ?? storedId(DEFAULT_ANONYMOUS_USER_ID_KEY),
        routePattern: pattern === null ? null : closedRoutePattern(pattern),
    };
}

export function trackTelemetryEvent<Name extends TelemetryEventName>(
    name: Name,
    payload: TelemetryPayloadByName[Name],
): void {
    const win = getWindow();
    if (!win || !canTrackProductTelemetry()) {
        return;
    }

    if (INTERACTION_EVENT_NAMES.has(name)) {
        // The session summary counts these; TelemetryProvider listens.
        win.dispatchEvent(new Event(TELEMETRY_INTERACTION_EVENT));
    }

    const closed = applyTelemetrySchema(name, payload);
    if (!closed.ok) {
        logger.debug(
            { event: name, key: closed.key },
            "Telemetry event dropped: a payload value is outside its closed set",
        );
        return;
    }
    const sanitized = sanitizeTelemetryPayload(closed.payload);
    if (!sanitized.ok) {
        logger.debug(
            { event: name, key: sanitized.key },
            "Telemetry event dropped: a payload value is out of bounds",
        );
        return;
    }

    const now = Date.now();
    const event: TelemetryEvent<Name> = {
        name,
        schemaVersion: "2026-05-telemetry-v1",
        eventId: randomId(),
        ts: new Date(now).toISOString(),
        sessionId: telemetryContext.sessionId ?? activeSessionId(now),
        anonymousUserId:
            telemetryContext.anonymousUserId ?? storedId(DEFAULT_ANONYMOUS_USER_ID_KEY),
        orgIdHash: telemetryContext.orgIdHash ?? null,
        routePattern: closedRoutePattern(
            telemetryContext.routePattern ?? routePatternForPathname(win.location.pathname),
        ),
        payload: sanitized.payload as TelemetryPayloadByName[Name],
    };

    const closedEvent = closeTelemetryEvent(event);
    if (!closedEvent) {
        logger.debug(
            { event: name },
            "Telemetry event dropped: an envelope value is outside its closed set",
        );
        return;
    }
    getTelemetryQueue().enqueue(closedEvent);
}

export type { TelemetryAdapter, TelemetryEvent, TelemetryEventName, TelemetryPayloadByName };
