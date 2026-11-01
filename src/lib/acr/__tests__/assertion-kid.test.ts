import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signWebAssertion } from "../assertion";
import { loadAcrRuntimeConfig } from "../config";
import { AcrRuntimeError } from "../errors";

const loggerSink = vi.hoisted(() => ({
    calls: [] as unknown[][],
}));

vi.mock("@/lib/logger", () => {
    const record =
        () =>
        (...args: unknown[]) => {
            loggerSink.calls.push(args);
        };
    return {
        logger: {
            debug: record(),
            error: record(),
            fatal: record(),
            info: record(),
            trace: record(),
            warn: record(),
        },
    };
});

// The kid form the ops registry accepts: printable non-space ASCII, 1..256 bytes
// (dev-health-ops 0039_workload_assertion_keys.sql kid CHECK; assertion_keys.go ValidateAssertionKey).
const REGISTRY_KID_FORM = /^[!-~]{1,256}$/u;
const FIXED_CONFIGURATION_MESSAGE = "Agent Context Runtime is not configured.";

const temporaryPaths: string[] = [];

type KeyFiles = {
    readonly der: Buffer;
    readonly directory: string;
    readonly keyFile: string;
    readonly pem: string;
};

function newDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "acr-kid-"));
    temporaryPaths.push(directory);
    return directory;
}

function writeKey(mode = 0o600, type: "ed25519" | "rsa" = "ed25519"): KeyFiles {
    const directory = newDirectory();
    const privateKey: KeyObject =
        type === "ed25519"
            ? generateKeyPairSync("ed25519").privateKey
            : generateKeyPairSync("rsa", { modulusLength: 2_048 }).privateKey;
    const pem = String(privateKey.export({ format: "pem", type: "pkcs8" }));
    const der = privateKey.export({ format: "der", type: "pkcs8" });
    const keyFile = join(directory, "web-assertion.key");
    writeFileSync(keyFile, pem);
    chmodSync(keyFile, mode);
    return { der, directory, keyFile, pem };
}

function configure(keyFile: string, keyId = "web-key-2026"): void {
    vi.stubEnv("ACR_API_ORIGIN", "https://acr.example.test");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", keyFile);
    vi.stubEnv("ACR_WEB_ASSERTION_KID", keyId);
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
}

function sign(keyId: string): { claims: Record<string, unknown>; header: Record<string, unknown> } {
    const config = loadAcrRuntimeConfig();
    expect(config.keyId).toBe(keyId);
    const assertion = signWebAssertion({
        body: "{}",
        config,
        method: "POST",
        now: 1_700_000_000,
        orgId: "org-1",
        path: "/api/v1/agent-context/context-packets",
        permissions: ["context:read"],
        privateKey: config.privateKey,
        repositoryScopes: ["full-chaos/dev-health-acr"],
        subject: "user-1",
    });
    const [header, claims] = assertion.split(".");
    const decode = (part: string | undefined): Record<string, unknown> =>
        JSON.parse(Buffer.from(part ?? "", "base64url").toString("utf8")) as Record<
            string,
            unknown
        >;
    return { claims: decode(claims), header: decode(header) };
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const temporaryPath of temporaryPaths.splice(0)) {
        rmSync(temporaryPath, { force: true, recursive: true });
    }
});

describe("web assertion signer kid", () => {
    it("signed header kid equals ACR_WEB_ASSERTION_KID and nothing else", () => {
        const { keyFile } = writeKey();

        configure(keyFile, "web-key-A");
        const first = sign("web-key-A");
        expect(first.header.kid).toBe("web-key-A");
        expect(first.header.alg).toBe("EdDSA");
        expect(first.header.typ).toBe("JWT");
        expect(Object.keys(first.header).sort()).toEqual(["alg", "kid", "typ"]);

        configure(keyFile, "web-key-B");
        expect(sign("web-key-B").header.kid).toBe("web-key-B");
    });

    it("no kid in the claims and no previous-kid member", () => {
        const { keyFile } = writeKey();
        configure(keyFile, "web-key-A");

        const { claims } = sign("web-key-A");

        for (const member of ["kid", "prev_kid", "previous_kid", "key_id", "keys"]) {
            expect(claims).not.toHaveProperty(member);
        }
    });
});

describe("web assertion kid form against the registry kid form", () => {
    it("web kid regex accepts only a subset of the registry kid form", () => {
        const { keyFile } = writeKey();
        const accepted = ["web-key-2026", "a.b_c-1", "k".repeat(128), "A"];
        const refused = ["", "k".repeat(129), "has space", "a/b", "a:b", "café", "a\nb"];

        for (const kid of accepted) {
            configure(keyFile, kid);
            expect(loadAcrRuntimeConfig().keyId).toBe(kid);
            expect(REGISTRY_KID_FORM.test(kid)).toBe(true);
        }
        for (const kid of refused) {
            configure(keyFile, kid);
            expect(() => loadAcrRuntimeConfig()).toThrow(AcrRuntimeError);
        }
    });

    it("every single ASCII character web accepts as a kid the registry accepts too", () => {
        const { keyFile } = writeKey();
        let acceptedByWeb = 0;

        for (let code = 0; code < 0x80; code += 1) {
            const kid = String.fromCharCode(code);
            configure(keyFile, kid);
            let webAccepts = true;
            try {
                loadAcrRuntimeConfig();
            } catch {
                webAccepts = false;
            }
            if (webAccepts) {
                acceptedByWeb += 1;
                expect(REGISTRY_KID_FORM.test(kid), `code ${code}`).toBe(true);
            }
        }
        expect(acceptedByWeb).toBeGreaterThan(0);
    });
});

function dump(value: unknown, seen = new Set<unknown>()): string {
    if (value instanceof Error) {
        if (seen.has(value)) return "";
        seen.add(value);
        return [
            value.name,
            value.message,
            value.stack ?? "",
            String(value),
            safeJson(value),
            dump(value.cause, seen),
        ].join("\n");
    }
    if (typeof value === "object" && value !== null) {
        return Object.values(value)
            .map((member) => dump(member, seen))
            .concat(safeJson(value))
            .join("\n");
    }
    return String(value);
}

function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value) ?? "";
    } catch {
        return "";
    }
}

function captureSinks(): () => string {
    const consoleLines: string[] = [];
    loggerSink.calls.length = 0;
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
            consoleLines.push(dump(args));
        });
    }
    return () => [...consoleLines, ...loggerSink.calls.map((call) => dump(call))].join("\n");
}

describe("web assertion key material in logs", () => {
    it("config load, sign and a key-read failure write no key material to any log sink", () => {
        const collected = captureSinks();
        const good = writeKey();
        const secrets = (files: KeyFiles): string[] => [
            files.pem,
            files.pem.split("\n").find((line) => line.length > 20 && !line.startsWith("-----")) ??
                "",
            files.der.toString("base64"),
            files.der.toString("base64url"),
            files.keyFile,
            files.directory,
            "BEGIN PRIVATE KEY",
        ];
        const forbidden: string[] = [...secrets(good)];
        const failures: unknown[] = [];

        configure(good.keyFile);
        sign("web-key-2026");

        const wrongMode = writeKey(0o644);
        forbidden.push(...secrets(wrongMode));
        const rsa = writeKey(0o600, "rsa");
        forbidden.push(...secrets(rsa));
        const oversize = writeKey();
        writeFileSync(oversize.keyFile, "x".repeat(17 * 1_024));
        forbidden.push(oversize.keyFile);
        const linkDirectory = newDirectory();
        const link = join(linkDirectory, "link.key");
        symlinkSync(good.keyFile, link);
        forbidden.push(link);
        const missing = join(newDirectory(), "absent.key");
        forbidden.push(missing);

        for (const keyFile of [wrongMode.keyFile, rsa.keyFile, oversize.keyFile, link, missing]) {
            configure(keyFile);
            try {
                loadAcrRuntimeConfig();
                throw new Error("expected a configuration error");
            } catch (error) {
                expect(error).toBeInstanceOf(AcrRuntimeError);
                failures.push(error);
            }
        }

        const everything = collected();
        for (const secret of forbidden) {
            expect(secret.length).toBeGreaterThan(0);
            expect(everything.includes(secret)).toBe(false);
        }
        for (const failure of failures) {
            const error = failure as AcrRuntimeError;
            expect(error.message).toBe(FIXED_CONFIGURATION_MESSAGE);
            const surface = [String(error), safeJson(error), error.message].join("\n");
            for (const secret of forbidden) {
                expect(surface.includes(secret), "error surface").toBe(false);
            }
        }
    });
});
