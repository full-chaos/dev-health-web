import { z } from "zod";
const deviceApprovalPreviewResponseSchema = z
    .object({
        schema_version: z.literal("device_approval_preview_response.v1"),
        repository_hints: z.array(z.string()),
    })
    .strict();
