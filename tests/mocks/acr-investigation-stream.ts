import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * acr-api's investigation event stream for e2e (CHAOS-12104, T14a): the real capture (#1608), with
 * `accepted` naming the request's thread and submission, as ACR does since T9.
 */
const CAPTURE = readFileSync(
    join(
        process.cwd(),
        "src/lib/ask-dev/acr-transport/__tests__/captures/context_fabric_investigation_event_stream.v1.sse",
    ),
    "utf8",
);

/** The capture, with `accepted` naming this request's thread and submission. */
export function investigationStreamFor(threadId: string, submissionId: string): string {
    const [first, ...rest] = CAPTURE.split("\n\n");
    const lines = first!.split("\n");
    const at = lines.findIndex((line) => line.startsWith("data: "));
    const accepted = JSON.parse(lines[at]!.slice("data: ".length)) as Record<string, unknown>;
    lines[at] =
        `data: ${JSON.stringify({ ...accepted, thread_id: threadId, submission_id: submissionId })}`;
    return [lines.join("\n"), ...rest].join("\n\n");
}

export const INVESTIGATIONS_PATH = "/api/v1/context-fabric/investigations";
