import "server-only";

import { createPrivateKey, type KeyObject } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { z } from "zod";

import {
    acrBrowserClientConfig,
    type AcrBrowserClientConfig,
} from "@/lib/ask-dev/acr-browser-config";

import { AcrRuntimeError, acrRuntimeErrorCodes } from "./errors";

const configSchema = z.object({
    apiOrigin: z.string().trim().min(1).max(2_048),
    audience: z.string().trim().min(1).max(200),
    issuer: z.string().trim().min(1).max(200),
    keyFile: z.string().trim().min(1).max(2_048),
    keyId: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9._-]{1,128}$/u),
    timeoutMs: z.coerce.number().int().min(100).max(30_000).default(5_000),
});

export type AcrRuntimeConfig = {
    readonly apiOrigin: URL;
    readonly audience: string;
    readonly issuer: string;
    readonly keyId: string;
    readonly privateKey: KeyObject;
    readonly timeoutMs: number;
};

function parseApiOrigin(rawOrigin: string): URL {
    let origin: URL;
    try {
        origin = new URL(rawOrigin);
    } catch (error) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.configuration,
            "Agent Context Runtime is not configured.",
            { cause: error },
        );
    }
    if (
        (origin.protocol !== "http:" && origin.protocol !== "https:") ||
        origin.username !== "" ||
        origin.password !== "" ||
        origin.pathname !== "/" ||
        origin.search !== "" ||
        origin.hash !== ""
    ) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.configuration,
            "Agent Context Runtime is not configured.",
        );
    }
    return origin;
}

function readPrivateKey(keyFile: string): KeyObject {
    try {
        const descriptor = openSync(keyFile, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const metadata = fstatSync(descriptor);
            if (!metadata.isFile() || metadata.size < 1 || metadata.size > 16 * 1_024) {
                throw new AcrRuntimeError(
                    acrRuntimeErrorCodes.configuration,
                    "Agent Context Runtime is not configured.",
                );
            }
            if ((metadata.mode & 0o077) !== 0) {
                throw new AcrRuntimeError(
                    acrRuntimeErrorCodes.configuration,
                    "Agent Context Runtime is not configured.",
                );
            }
            const privateKey = createPrivateKey(readFileSync(descriptor, "utf8"));
            if (privateKey.asymmetricKeyType !== "ed25519") {
                throw new AcrRuntimeError(
                    acrRuntimeErrorCodes.configuration,
                    "Agent Context Runtime is not configured.",
                );
            }
            return privateKey;
        } finally {
            closeSync(descriptor);
        }
    } catch (error) {
        if (error instanceof AcrRuntimeError) throw error;
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.configuration,
            "Agent Context Runtime is not configured.",
            { cause: error },
        );
    }
}

export function loadAcrRuntimeConfig(): AcrRuntimeConfig {
    const parsed = configSchema.safeParse({
        apiOrigin: process.env.ACR_API_ORIGIN,
        audience: process.env.ACR_WEB_ASSERTION_AUDIENCE,
        issuer: process.env.ACR_WEB_ASSERTION_ISSUER,
        keyFile: process.env.ACR_WEB_ASSERTION_KEY_FILE,
        keyId: process.env.ACR_WEB_ASSERTION_KID,
        timeoutMs: process.env.ACR_REQUEST_TIMEOUT_MS,
    });
    if (!parsed.success) {
        throw new AcrRuntimeError(
            acrRuntimeErrorCodes.configuration,
            "Agent Context Runtime is not configured.",
        );
    }
    return {
        apiOrigin: parseApiOrigin(parsed.data.apiOrigin),
        audience: parsed.data.audience,
        issuer: parsed.data.issuer,
        keyId: parsed.data.keyId,
        privateKey: readPrivateKey(parsed.data.keyFile),
        timeoutMs: parsed.data.timeoutMs,
    };
}

export type FirstPartyBrowserClient = {
    /** ACR's OAuth issuer: the resource ACR binds for its first-party browser client only. */
    readonly resource: string;
    /** This web app's public origin: where that client's redirects come back to. */
    readonly webOrigin: string;
};

function exactOrigin(raw: string | undefined): string | undefined {
    const value = raw?.trim();
    if (!value) return undefined;
    try {
        const url = new URL(value);
        return (url.protocol === "https:" || url.protocol === "http:") &&
            url.username === "" &&
            url.password === ""
            ? url.origin
            : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The first-party browser client of ACR's OAuth server (CHAOS-12095, design T4c). ACR binds its
 * own issuer (`ACR_OAUTH_ISSUER`, the acr-api resource) only for a configured first-party browser
 * client, and refuses it for every other client (CHAOS-12123), so a consent request bound to it
 * is that client's. `undefined` when ACR_OAUTH_ISSUER or the web origin (AUTH_URL, NEXTAUTH_URL)
 * is unset or not an origin: then no client is first-party and every client sees the consent page.
 */
/**
 * Whether `credential:issue` assertions carry the `sid` and `impersonating` claims (CHAOS-12095).
 * ACR refuses an assertion with a claim it does not know, and only an ACR with the browser-class
 * parser (CHAOS-12123) knows these two. ACR_OAUTH_ISSUER is set in the same deploy that rolls ACR
 * to that parser, so the claims follow it: unset, the assertion is the one this web sent before.
 * Only the claims are gated; the impersonation refusal holds either way.
 */
export function issuanceProvenanceClaimsEnabled(): boolean {
    return (process.env.ACR_OAUTH_ISSUER?.trim() ?? "") !== "";
}

export function loadFirstPartyBrowserClient(): FirstPartyBrowserClient | undefined {
    const rawIssuer = process.env.ACR_OAUTH_ISSUER?.trim();
    const resource = exactOrigin(rawIssuer);
    const webOrigin = exactOrigin(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL);
    if (resource === undefined || resource !== rawIssuer || webOrigin === undefined) {
        return undefined;
    }
    return { resource, webOrigin };
}

/**
 * The ACR browser client web serves the metadata document for (CHAOS-12302). It is built from T4c's
 * first-party pair, so every client web serves is one T4c approves with no click. On top of that it
 * applies the browser client's own rules (`acrBrowserClientConfig`).
 */
export function serverAcrClientConfig(): AcrBrowserClientConfig | undefined {
    const firstParty = loadFirstPartyBrowserClient();
    if (firstParty === undefined) return undefined;
    return acrBrowserClientConfig(firstParty.resource, firstParty.webOrigin);
}
