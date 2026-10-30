import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import acrClientCredentialSchema from "./contracts/schemas/acr_client_credential.v1.schema.json";
import agentEpisodeCreateSchema from "./contracts/schemas/agent_episode_create.v1.schema.json";
import agentEpisodeSchema from "./contracts/schemas/agent_episode.v1.schema.json";
import capabilitiesSchema from "./contracts/schemas/capabilities.v1.schema.json";
import contextFabricAnswerProjectionSchema from "./contracts/schemas/context_fabric_answer_projection.v1.schema.json";
import contextFabricCommonSchema from "./contracts/schemas/context_fabric_common.v1.schema.json";
import contextFabricInvestigationEventSchema from "./contracts/schemas/context_fabric_investigation_event.v1.schema.json";
import contextFabricInvestigationRequestSchema from "./contracts/schemas/context_fabric_investigation_request.v1.schema.json";
import contextFabricInvestigationResponseSchema from "./contracts/schemas/context_fabric_investigation_response.v1.schema.json";
import contextFabricInvestigationResponseV2Schema from "./contracts/schemas/context_fabric_investigation_response.v2.schema.json";
import contextFabricInvestigationResultSchema from "./contracts/schemas/context_fabric_investigation_result.v1.schema.json";
import contextFabricInvestigationResultV2Schema from "./contracts/schemas/context_fabric_investigation_result.v2.schema.json";
import contextFabricSubmissionStatusSchema from "./contracts/schemas/context_fabric_submission_status.v1.schema.json";
import contextPacketItemSchema from "./contracts/schemas/context_packet_item.v1.schema.json";
import contextPacketRequestSchema from "./contracts/schemas/context_packet_request.v1.schema.json";
import contextPacketSchema from "./contracts/schemas/context_packet.v1.schema.json";
import credentialAckRequestSchema from "./contracts/schemas/credential_ack_request.v1.schema.json";
import credentialAckResponseSchema from "./contracts/schemas/credential_ack_response.v1.schema.json";
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
import mcpReadFactsRequestSchema from "./contracts/schemas/mcp_read_facts_request.v1.schema.json";
import mcpReadFactsResponseSchema from "./contracts/schemas/mcp_read_facts_response.v1.schema.json";
import mcpReadRelationshipsRequestSchema from "./contracts/schemas/mcp_read_relationships_request.v1.schema.json";
import mcpReadRelationshipsResponseSchema from "./contracts/schemas/mcp_read_relationships_response.v1.schema.json";
import oauthDeviceErrorSchema from "./contracts/schemas/oauth_device_error.v1.schema.json";
import oauthTokenExchangeErrorSchema from "./contracts/schemas/oauth_token_exchange_error.v1.schema.json";
import tokenExchangeResponseSchema from "./contracts/schemas/token_exchange_response.v1.schema.json";
import contextPacketExample from "./contracts/examples/context_packet.v1.json";
import expandedEvidenceExample from "./contracts/examples/expanded_evidence.v1.json";

export const acrSchemas = {
    acrClientCredential: acrClientCredentialSchema,
    agentEpisodeCreate: agentEpisodeCreateSchema,
    agentEpisode: agentEpisodeSchema,
    capabilities: capabilitiesSchema,
    contextFabricAnswerProjection: contextFabricAnswerProjectionSchema,
    contextFabricCommon: contextFabricCommonSchema,
    contextFabricInvestigationEvent: contextFabricInvestigationEventSchema,
    contextFabricInvestigationRequest: contextFabricInvestigationRequestSchema,
    contextFabricInvestigationResponse: contextFabricInvestigationResponseSchema,
    contextFabricInvestigationResponseV2: contextFabricInvestigationResponseV2Schema,
    contextFabricInvestigationResult: contextFabricInvestigationResultSchema,
    contextFabricInvestigationResultV2: contextFabricInvestigationResultV2Schema,
    contextFabricSubmissionStatus: contextFabricSubmissionStatusSchema,
    contextPacketItem: contextPacketItemSchema,
    contextPacketRequest: contextPacketRequestSchema,
    contextPacket: contextPacketSchema,
    credentialAckRequest: credentialAckRequestSchema,
    credentialAckResponse: credentialAckResponseSchema,
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
    mcpReadFactsRequest: mcpReadFactsRequestSchema,
    mcpReadFactsResponse: mcpReadFactsResponseSchema,
    mcpReadRelationshipsRequest: mcpReadRelationshipsRequestSchema,
    mcpReadRelationshipsResponse: mcpReadRelationshipsResponseSchema,
    oauthDeviceError: oauthDeviceErrorSchema,
    oauthTokenExchangeError: oauthTokenExchangeErrorSchema,
    tokenExchangeResponse: tokenExchangeResponseSchema,
};

const acrSchemaFiles = {
    "acr_client_credential.v1.schema.json": acrClientCredentialSchema,
    "agent_episode_create.v1.schema.json": agentEpisodeCreateSchema,
    "agent_episode.v1.schema.json": agentEpisodeSchema,
    "capabilities.v1.schema.json": capabilitiesSchema,
    "context_fabric_answer_projection.v1.schema.json": contextFabricAnswerProjectionSchema,
    "context_fabric_common.v1.schema.json": contextFabricCommonSchema,
    "context_fabric_investigation_event.v1.schema.json": contextFabricInvestigationEventSchema,
    "context_fabric_investigation_request.v1.schema.json": contextFabricInvestigationRequestSchema,
    "context_fabric_investigation_response.v1.schema.json":
        contextFabricInvestigationResponseSchema,
    "context_fabric_investigation_response.v2.schema.json":
        contextFabricInvestigationResponseV2Schema,
    "context_fabric_investigation_result.v1.schema.json": contextFabricInvestigationResultSchema,
    "context_fabric_investigation_result.v2.schema.json": contextFabricInvestigationResultV2Schema,
    "context_fabric_submission_status.v1.schema.json": contextFabricSubmissionStatusSchema,
    "context_packet_item.v1.schema.json": contextPacketItemSchema,
    "context_packet_request.v1.schema.json": contextPacketRequestSchema,
    "context_packet.v1.schema.json": contextPacketSchema,
    "credential_ack_request.v1.schema.json": credentialAckRequestSchema,
    "credential_ack_response.v1.schema.json": credentialAckResponseSchema,
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
    "mcp_read_facts_request.v1.schema.json": mcpReadFactsRequestSchema,
    "mcp_read_facts_response.v1.schema.json": mcpReadFactsResponseSchema,
    "mcp_read_relationships_request.v1.schema.json": mcpReadRelationshipsRequestSchema,
    "mcp_read_relationships_response.v1.schema.json": mcpReadRelationshipsResponseSchema,
    "oauth_device_error.v1.schema.json": oauthDeviceErrorSchema,
    "oauth_token_exchange_error.v1.schema.json": oauthTokenExchangeErrorSchema,
    "token_exchange_response.v1.schema.json": tokenExchangeResponseSchema,
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
// Annotation only: acr lists the documented members of an open vocabulary here and a client must tolerate others.
ajv.addKeyword({ keyword: "x-documented-values", schemaType: "array" });
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
