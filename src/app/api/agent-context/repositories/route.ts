import { NextResponse } from "next/server";

import { AcrRuntimeError, acrRuntimeErrorCodes, safeAcrRuntimeMessage } from "@/lib/acr/errors";
import { listAuthorizedRepositories } from "@/lib/acr/service";
import { getCurrentOrg } from "@/lib/admin/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function responseHeaders(): HeadersInit {
    return { "Cache-Control": "no-store" };
}

function safeError(runtimeError: AcrRuntimeError): NextResponse {
    return NextResponse.json(
        {
            error: {
                code: runtimeError.code,
                message: safeAcrRuntimeMessage(runtimeError.code),
                retryable: runtimeError.retryable,
            },
        },
        { headers: responseHeaders(), status: runtimeError.status },
    );
}

export async function GET(): Promise<NextResponse> {
    try {
        const organization = await getCurrentOrg();
        const organizationId = organization.data?.id;
        if (!organizationId) {
            throw new AcrRuntimeError(
                acrRuntimeErrorCodes.unauthenticated,
                "Authentication is required.",
                { status: 401 },
            );
        }
        const repositories = await listAuthorizedRepositories(organizationId);
        return NextResponse.json({ repositories }, { headers: responseHeaders() });
    } catch (error) {
        if (error instanceof AcrRuntimeError) return safeError(error);
        return safeError(
            new AcrRuntimeError(
                acrRuntimeErrorCodes.unavailable,
                "Agent Context Runtime is temporarily unavailable.",
                { cause: error, retryable: true },
            ),
        );
    }
}
