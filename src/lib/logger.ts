/**
 * Structured logger for dev-health-web.
 *
 * Uses pino on the server and a lightweight console shim on the client.
 * Import and use `logger` everywhere instead of `console.log` / `console.error`.
 *
 * Configuration:
 *   LOG_LEVEL  — minimum severity (trace|debug|info|warn|error|fatal).
 *               Defaults to "debug" in development, "info" in production.
 *   LOG_FORMAT — output format ("json" | "pretty").
 *               Defaults to "pretty" in development, "json" in production.
 *               Set LOG_FORMAT=json in dev to test structured output locally.
 *               Set LOG_FORMAT=pretty in prod to get human-readable logs.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info({ userId }, "User signed in");
 *   logger.error({ err }, "Failed to fetch metrics");
 */

import { isServer } from "@/lib/env";
import { publicEnv, getServerEnv } from "@/lib/config";

type LogFormat = "json" | "pretty";
type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

interface LogFn {
    (obj: object, msg?: string): void;
    (msg: string): void;
}

interface Logger {
    trace: LogFn;
    debug: LogFn;
    info: LogFn;
    warn: LogFn;
    error: LogFn;
    fatal: LogFn;
    child: (bindings: Record<string, unknown>) => Logger;
}

const isProd = publicEnv.NODE_ENV === "production";

const LOG_LEVEL: LogLevel = (() => {
    if (!isServer) return isProd ? "info" : "debug";
    const env = getServerEnv();
    return (env.LOG_LEVEL as LogLevel | undefined) ?? (isProd ? "info" : "debug");
})();

const LOG_FORMAT: LogFormat = (() => {
    if (!isServer) return isProd ? "json" : "pretty";
    const env = getServerEnv();
    return (env.LOG_FORMAT as LogFormat | undefined) ?? (isProd ? "json" : "pretty");
})();

/**
 * Browser-side shim — pino cannot run in the browser.
 * Maps to console methods so existing DevTools workflows still work.
 */
function createBrowserLogger(bindings: Record<string, unknown> = {}): Logger {
    const levels: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];
    const minIdx = levels.indexOf(LOG_LEVEL);

    const makeFn =
        (level: LogLevel, consoleFn: (...args: unknown[]) => void): LogFn =>
        (objOrMsg: object | string, msg?: string) => {
            if (levels.indexOf(level) < minIdx) return;
            if (typeof objOrMsg === "string") {
                consoleFn(`[${level}]`, objOrMsg, bindings);
            } else {
                consoleFn(`[${level}]`, msg ?? "", { ...bindings, ...objOrMsg });
            }
        };

    return {
        trace: makeFn("trace", console.debug),
        debug: makeFn("debug", console.debug),
        info: makeFn("info", console.info),
        warn: makeFn("warn", console.warn),
        error: makeFn("error", console.error),
        fatal: makeFn("fatal", console.error),
        child: (newBindings) => createBrowserLogger({ ...bindings, ...newBindings }),
    };
}

/** Lazily initialise pino on the server side only. */
function createServerLogger(): Logger {
    // Dynamic require so bundlers don't try to bundle pino for the client.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pino = require("pino");
    return pino({
        level: LOG_LEVEL,
        formatters: {
            level: (label: string) => ({ level: label }),
        },
        ...(LOG_FORMAT === "pretty"
            ? {
                  transport: {
                      target: "pino-pretty",
                      options: { colorize: true, ignore: "pid,hostname" },
                  },
              }
            : {}),
    }) as Logger;
}

let _logger: Logger | null = null;

function getLogger(): Logger {
    if (!_logger) {
        _logger = isServer ? createServerLogger() : createBrowserLogger();
    }
    return _logger;
}

export const logger: Logger = new Proxy({} as Logger, {
    get(_target, prop) {
        return (getLogger() as unknown as Record<string | symbol, unknown>)[prop];
    },
});
