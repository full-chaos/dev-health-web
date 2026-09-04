import "server-only";

import { createPrivateKey, type KeyObject } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { z } from "zod";

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
