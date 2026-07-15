import { NextResponse } from "next/server";

import { AcrRuntimeError, safeAcrRuntimeMessage } from "@/lib/acr/errors";
import { getExpandedEvidence } from "@/lib/acr/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { readonly params: Promise<{ readonly evidenceRefId: string }> };

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

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
    try {
        const { evidenceRefId } = await context.params;
        const evidence = await getExpandedEvidence({
            evidenceRefId,
            repository: new URL(request.url).searchParams.get("repository"),
            signal: request.signal,
        });
        return NextResponse.json(evidence, { headers: responseHeaders() });
        // Unknown internal failures, including configuration parsing, must not cross this browser boundary.
    } catch (error) {
        if (error instanceof AcrRuntimeError) return safeError(error);
        return safeError(
            new AcrRuntimeError(
                "unavailable",
                "Agent Context Runtime is temporarily unavailable.",
                {
                    cause: error,
                    retryable: true,
                },
            ),
        );
    }
}
