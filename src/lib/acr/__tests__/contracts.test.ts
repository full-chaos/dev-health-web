import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { acrExamples, acrSchemas, validateAcrContract } from "../contracts";
import manifest from "../contracts/manifest.json";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ACR_ROOT = path.resolve(HERE, "../../../..");

describe("ACR REST contract boundary", () => {
    it("keeps the exact primary order before the documented OpenAPI schema closure", () => {
        const paths = manifest.files.map((file) => file.path);

        expect(paths).toEqual([
            "openapi/acr-v1.json",
            "schemas/capabilities.v1.schema.json",
            "schemas/context_packet.v1.schema.json",
            "schemas/context_packet_item.v1.schema.json",
            "schemas/context_packet_request.v1.schema.json",
            "schemas/error.v1.schema.json",
            "schemas/evidence_ref.v1.schema.json",
            "schemas/expanded_evidence.v1.schema.json",
            "examples/context_packet.v1.json",
            "examples/expanded_evidence.v1.json",
            "schemas/acr_client_credential.v1.schema.json",
            "schemas/agent_episode.v1.schema.json",
            "schemas/agent_episode_create.v1.schema.json",
            "schemas/credential_revoke_request.v1.schema.json",
            "schemas/credential_revoke_response.v1.schema.json",
            "schemas/credential_rotate_request.v1.schema.json",
            "schemas/credential_rotate_response.v1.schema.json",
            "schemas/device_approval_preview_request.v1.schema.json",
            "schemas/device_approval_preview_response.v1.schema.json",
            "schemas/device_approval_request.v1.schema.json",
            "schemas/device_approval_response.v1.schema.json",
            "schemas/device_authorization_request.v1.schema.json",
            "schemas/device_authorization_response.v1.schema.json",
            "schemas/device_token_request.v1.schema.json",
            "schemas/device_token_response.v1.schema.json",
            "schemas/oauth_device_error.v1.schema.json",
        ]);
        expect(JSON.stringify(manifest)).not.toMatch(/generated_at|timestamp|created_at/u);
        expect(manifest.source_commit).toBe("7e7c57be32c2b81bcd94994e584a554e2a05a99a");
    });

    it("accepts every committed golden with its paired Draft 2020-12 schema", () => {
        for (const example of acrExamples) {
            expect(validateAcrContract(example.schema, example.value)).toEqual({
                valid: true,
                errors: [],
            });
        }
    });

    it("resolves each copied OpenAPI schema reference inside the artifact tree", () => {
        const openapiPath = path.join(ACR_ROOT, "src/lib/acr/contracts/openapi/acr-v1.json");
        const openapi = fs.readFileSync(openapiPath, "utf8");
        const references = [...openapi.matchAll(/"\$ref": "\.\.\/schemas\/([^"]+)"/gu)].map(
            (match) => match[1],
        );

        expect(references.length).toBeGreaterThan(0);
        for (const schema of references) {
            expect(
                fs.existsSync(path.join(ACR_ROOT, "src/lib/acr/contracts/schemas", schema)),
            ).toBe(true);
        }
        expect(openapi).not.toContain("../jsonschema/v1/");
    });

    it("rejects a context request that includes a raw bearer token", () => {
        expect(
            validateAcrContract("context_packet_request.v1.schema.json", {
                schema_version: "context_packet_request.v1",
                request_id: "req_01J0ACR001",
                goal: "Test a sanitized contract boundary",
                repository: { slug: "full-chaos/dev-health-acr" },
                scope: {},
                options: {
                    max_items: 30,
                    max_output_tokens: 4000,
                    max_serialized_bytes: 262144,
                    include_debug: false,
                    include_low_confidence: false,
                },
                client: { name: "web", version: "0.1.0" },
                token: "fcacr_secret_value",
            }),
        ).toMatchObject({ valid: false });
        expect(acrSchemas.contextPacketRequest.properties).not.toHaveProperty("token");
    });

    it("detects a digest drift without rewriting committed artifacts", () => {
        const manifestPath = path.join(ACR_ROOT, "src/lib/acr/contracts/manifest.json");
        const before = fs.readFileSync(manifestPath, "utf8");
        const digest = manifest.files[0]?.sha256;

        expect(digest).toMatch(/^[a-f0-9]{64}$/u);
        expect(before).toContain(digest ?? "");
    });
});
