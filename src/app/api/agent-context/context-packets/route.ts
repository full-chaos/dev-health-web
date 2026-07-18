import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { AcrRuntimeError, safeAcrRuntimeMessage } from "@/lib/acr/errors";
import { readRequestJson } from "@/lib/acr/http";
import { createContextPacket } from "@/lib/acr/service";

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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function browserPacket(packet: unknown, isSuperuser: boolean): unknown {
    if (isSuperuser || !isObjectRecord(packet)) {
        return packet;
    }
    const { retrieval_debug_summary: _debug, ...safePacket } = packet;
    return safePacket;
}

export async function POST(request: Request): Promise<NextResponse> {
    try {
        const packet = await createContextPacket({
            body: await readRequestJson(request, 64 * 1_024),
            signal: request.signal,
        });
        const session = await auth();
        return NextResponse.json(browserPacket(packet, session?.user.is_superuser === true), {
            headers: responseHeaders(),
        });
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
