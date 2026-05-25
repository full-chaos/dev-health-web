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

const randomId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

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
