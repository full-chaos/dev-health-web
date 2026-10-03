import { logger } from "@/lib/logger";

/** The one sentence a failed READ shows. Never the backend text (ruling 107). */
export const READ_FAILED_MESSAGE = "Could not be read";

/**
 * The plain message for a FAILED read. The error goes to the log (client console shim or server
 * pino) with the operation name, so a developer can still debug; the screen gets one sentence.
 *
 * Only for the failed state. An empty read ("No data for this window") and a value the API does not
 * serve ("Not reported") keep their own words; never route them through here.
 */
export function readFailureMessage(error: unknown, operation: string): string {
    logger.error({ err: error, operation }, "Read failed");
    return READ_FAILED_MESSAGE;
}
