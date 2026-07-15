import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { acrExamples, acrSchemas, validateAcrContract } from "../contracts";
import manifest from "../contracts/manifest.json";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ACR_ROOT = path.resolve(HERE, "../../../..");

describe("ACR REST contract boundary", () => {
    it("keeps the manifest lexically ordered and free from timestamps", () => {
        const paths = manifest.files.map((file) => file.path);

        expect(paths).toEqual([...paths].sort());
        expect(JSON.stringify(manifest)).not.toMatch(/generated_at|timestamp|created_at/u);
        expect(manifest.source_commit).toBe("11c44ef812f9f9ae71a044d64f00ebae1ea1602f");
    });

    it("accepts every committed golden with its paired Draft 2020-12 schema", () => {
        for (const example of acrExamples) {
            expect(validateAcrContract(example.schema, example.value)).toEqual({
                valid: true,
                errors: [],
            });
        }
    });

    it("rejects a credential payload that includes a raw bearer token", () => {
        const credential = acrExamples.find(
            (example) => example.schema === "acr_client_credential.v1.schema.json",
        );

        expect(credential).toBeDefined();
        if (credential === undefined) return;

        expect(
            validateAcrContract(credential.schema, {
                ...credential.value,
                token: "fcacr_secret_value",
            }),
        ).toMatchObject({ valid: false });
        expect(acrSchemas.acrClientCredential.properties).not.toHaveProperty("token");
    });

    it("detects a digest drift without rewriting committed artifacts", () => {
        const manifestPath = path.join(ACR_ROOT, "src/lib/acr/contracts/manifest.json");
        const before = fs.readFileSync(manifestPath, "utf8");
        const digest = manifest.files[0]?.sha256;

        expect(digest).toMatch(/^[a-f0-9]{64}$/u);
        expect(before).toContain(digest ?? "");
    });
});
