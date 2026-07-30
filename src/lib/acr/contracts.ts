import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import acrClientCredentialSchema from "./contracts/schemas/acr_client_credential.v1.schema.json";
import agentEpisodeCreateSchema from "./contracts/schemas/agent_episode_create.v1.schema.json";
import agentEpisodeSchema from "./contracts/schemas/agent_episode.v1.schema.json";
import capabilitiesSchema from "./contracts/schemas/capabilities.v1.schema.json";
import contextPacketItemSchema from "./contracts/schemas/context_packet_item.v1.schema.json";
import contextPacketRequestSchema from "./contracts/schemas/context_packet_request.v1.schema.json";
import contextPacketSchema from "./contracts/schemas/context_packet.v1.schema.json";
import credentialRevokeRequestSchema from "./contracts/schemas/credential_revoke_request.v1.schema.json";
import credentialRevokeResponseSchema from "./contracts/schemas/credential_revoke_response.v1.schema.json";
import credentialRotateRequestSchema from "./contracts/schemas/credential_rotate_request.v1.schema.json";
import credentialRotateResponseSchema from "./contracts/schemas/credential_rotate_response.v1.schema.json";
import deviceApprovalPreviewRequestSchema from "./contracts/schemas/device_approval_preview_request.v1.schema.json";
import deviceApprovalPreviewResponseSchema from "./contracts/schemas/device_approval_preview_response.v1.schema.json";
import deviceApprovalRequestSchema from "./contracts/schemas/device_approval_request.v1.schema.json";
import deviceApprovalResponseSchema from "./contracts/schemas/device_approval_response.v1.schema.json";
import deviceAuthorizationRequestSchema from "./contracts/schemas/device_authorization_request.v1.schema.json";
import deviceAuthorizationResponseSchema from "./contracts/schemas/device_authorization_response.v1.schema.json";
import deviceTokenRequestSchema from "./contracts/schemas/device_token_request.v1.schema.json";
import deviceTokenResponseSchema from "./contracts/schemas/device_token_response.v1.schema.json";
import errorSchema from "./contracts/schemas/error.v1.schema.json";
import evidenceRefSchema from "./contracts/schemas/evidence_ref.v1.schema.json";
import expandedEvidenceSchema from "./contracts/schemas/expanded_evidence.v1.schema.json";
import oauthDeviceErrorSchema from "./contracts/schemas/oauth_device_error.v1.schema.json";
import contextPacketExample from "./contracts/examples/context_packet.v1.json";
import expandedEvidenceExample from "./contracts/examples/expanded_evidence.v1.json";

export const acrSchemas = {
    acrClientCredential: acrClientCredentialSchema,
    agentEpisodeCreate: agentEpisodeCreateSchema,
    agentEpisode: agentEpisodeSchema,
    capabilities: capabilitiesSchema,
    contextPacketItem: contextPacketItemSchema,
    contextPacketRequest: contextPacketRequestSchema,
    contextPacket: contextPacketSchema,
    credentialRevokeRequest: credentialRevokeRequestSchema,
    credentialRevokeResponse: credentialRevokeResponseSchema,
    credentialRotateRequest: credentialRotateRequestSchema,
    credentialRotateResponse: credentialRotateResponseSchema,
    deviceApprovalPreviewRequest: deviceApprovalPreviewRequestSchema,
    deviceApprovalPreviewResponse: deviceApprovalPreviewResponseSchema,
    deviceApprovalRequest: deviceApprovalRequestSchema,
    deviceApprovalResponse: deviceApprovalResponseSchema,
    deviceAuthorizationRequest: deviceAuthorizationRequestSchema,
    deviceAuthorizationResponse: deviceAuthorizationResponseSchema,
    deviceTokenRequest: deviceTokenRequestSchema,
    deviceTokenResponse: deviceTokenResponseSchema,
    error: errorSchema,
    evidenceRef: evidenceRefSchema,
    expandedEvidence: expandedEvidenceSchema,
    oauthDeviceError: oauthDeviceErrorSchema,
};

const acrSchemaFiles = {
    "acr_client_credential.v1.schema.json": acrClientCredentialSchema,
    "agent_episode_create.v1.schema.json": agentEpisodeCreateSchema,
    "agent_episode.v1.schema.json": agentEpisodeSchema,
    "capabilities.v1.schema.json": capabilitiesSchema,
    "context_packet_item.v1.schema.json": contextPacketItemSchema,
    "context_packet_request.v1.schema.json": contextPacketRequestSchema,
    "context_packet.v1.schema.json": contextPacketSchema,
    "credential_revoke_request.v1.schema.json": credentialRevokeRequestSchema,
    "credential_revoke_response.v1.schema.json": credentialRevokeResponseSchema,
    "credential_rotate_request.v1.schema.json": credentialRotateRequestSchema,
    "credential_rotate_response.v1.schema.json": credentialRotateResponseSchema,
    "device_approval_preview_request.v1.schema.json": deviceApprovalPreviewRequestSchema,
    "device_approval_preview_response.v1.schema.json": deviceApprovalPreviewResponseSchema,
    "device_approval_request.v1.schema.json": deviceApprovalRequestSchema,
    "device_approval_response.v1.schema.json": deviceApprovalResponseSchema,
    "device_authorization_request.v1.schema.json": deviceAuthorizationRequestSchema,
    "device_authorization_response.v1.schema.json": deviceAuthorizationResponseSchema,
    "device_token_request.v1.schema.json": deviceTokenRequestSchema,
    "device_token_response.v1.schema.json": deviceTokenResponseSchema,
    "error.v1.schema.json": errorSchema,
    "evidence_ref.v1.schema.json": evidenceRefSchema,
    "expanded_evidence.v1.schema.json": expandedEvidenceSchema,
    "oauth_device_error.v1.schema.json": oauthDeviceErrorSchema,
};

export const acrExamples = [
    { schema: "context_packet.v1.schema.json", value: contextPacketExample },
    { schema: "expanded_evidence.v1.schema.json", value: expandedEvidenceExample },
] as const;

const ajv = new Ajv2020({
    allErrors: true,
    strictRequired: false,
    strictSchema: true,
    strictTypes: false,
});
addFormats(ajv);
for (const [schemaName, schema] of Object.entries(acrSchemaFiles))
    ajv.addSchema(schema, schemaName);

type ValidationResult = {
    readonly valid: boolean;
    readonly errors: readonly string[];
};

export function validateAcrContract(schema: string, value: unknown): ValidationResult {
    const validator = ajv.getSchema(schema);
    if (validator === undefined) return { valid: false, errors: ["schema is unavailable"] };
    if (validator(value)) return { valid: true, errors: [] };
    return {
        valid: false,
        errors: (validator.errors ?? []).map(
            (error) => `${error.instancePath} ${error.message ?? error.keyword}`,
        ),
    };
}
