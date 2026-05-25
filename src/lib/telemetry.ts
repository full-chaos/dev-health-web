import { getLocalStorage, getWindow } from "@/lib/env";

import { consoleTelemetryAdapter, firstPartyTelemetryAdapter, type TelemetryAdapter } from "./telemetry/adapters";
import { canTrackProductTelemetry } from "./telemetry/config";
import { createTelemetryQueue, type TelemetryQueue } from "./telemetry/queue";
import { routePatternForPathname } from "./telemetry/routePatterns";
import { sanitizeTelemetryPayload } from "./telemetry/sanitize";
import type { TelemetryEvent, TelemetryEventName, TelemetryPayloadByName } from "./telemetry/types";

const DEFAULT_SESSION_ID_KEY = "devhealth-product-telemetry-session-id";
const DEFAULT_ANONYMOUS_USER_ID_KEY = "devhealth-product-telemetry-anonymous-user-id";

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
    flushIntervalMs: configuration.flushIntervalMs ?? defaultTelemetryConfiguration.flushIntervalMs,
  };
}

export function setTelemetryContext(context: TelemetryContext): void {
  telemetryContext = { ...telemetryContext, ...context };
}

export async function flushTelemetryEvents(): Promise<void> {
  await telemetryQueue?.flush();
}

export function resetTelemetryForTests(): void {
  telemetryQueue?.dispose();
  telemetryQueue = null;
  telemetryContext = {};
  telemetryConfiguration = defaultTelemetryConfiguration;
}

export function trackTelemetryEvent<Name extends TelemetryEventName>(
  name: Name,
  payload: TelemetryPayloadByName[Name],
): void {
  const win = getWindow();
  if (!win || !canTrackProductTelemetry()) {
    return;
  }

  const event: TelemetryEvent<Name> = {
    name,
    schemaVersion: "2026-05-telemetry-v1",
    eventId: randomId(),
    ts: new Date().toISOString(),
    sessionId: telemetryContext.sessionId ?? storedId(DEFAULT_SESSION_ID_KEY),
    anonymousUserId: telemetryContext.anonymousUserId ?? storedId(DEFAULT_ANONYMOUS_USER_ID_KEY),
    orgIdHash: telemetryContext.orgIdHash ?? null,
    routePattern:
      telemetryContext.routePattern ?? routePatternForPathname(win.location.pathname),
    payload: sanitizeTelemetryPayload(payload) as TelemetryPayloadByName[Name],
  };

  getTelemetryQueue().enqueue(event);
}

export type { TelemetryAdapter, TelemetryEvent, TelemetryEventName, TelemetryPayloadByName };
