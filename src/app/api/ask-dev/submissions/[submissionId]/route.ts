import {
    newRequestId,
    pathIdOrNotFound,
    prepareRead,
    readFailure,
    readSignal,
    readSuccess,
} from "@/lib/ask-dev/read.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE = "GET /api/ask-dev/submissions/{submissionId}";

/**
 * The caller's own submission record, for recovery after a dropped stream. Read-only. Every call
 * re-reads the session and both entitlements and signs a fresh assertion; ACR keys the record by
 * the authenticated principal and answers one 404 for another principal's id, an unknown id and a
 * malformed one.
 */
export async function GET(
    request: Request,
    context: { params: Promise<{ submissionId: string }> },
): Promise<Response> {
    const requestId = newRequestId();
    const { submissionId } = await context.params;
    try {
        const id = pathIdOrNotFound(submissionId, 128);
        const signal = readSignal(request);
        const prepared = await prepareRead(signal);
        const value = await prepared.client.submissionStatus({
            authorization: prepared.authorization,
            requestId,
            signal,
            submissionId: id,
        });
        return readSuccess(value, requestId);
    } catch (error) {
        return readFailure(error, requestId, ROUTE, { submission_id: submissionId.slice(0, 128) });
    }
}
