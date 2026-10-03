import { logger } from "@/lib/logger";

/** The one sentence a failed READ shows. Never the backend text (ruling 107). */
export const READ_FAILED_MESSAGE = "Could not be read";

/**
 * The plain message for a FAILED read in a SERVER loader (a server component that catches a thrown
 * error): the error goes to the server log with the operation name, once per request, and the
 * screen gets one sentence. Do not call this while rendering a client view: a urql failure is
 * already logged once by the errorExchange (src/lib/graphql/urqlExchanges.ts), so a client view
 * shows `READ_FAILED_MESSAGE` and logs nothing more.
 *
 * Only for the failed state. An empty read ("No data for this window") and a value the API does not
 * serve ("Not reported") keep their own words; never route them through here.
 */
export function readFailureMessage(error: unknown, operation: string): string {
    logger.error({ err: error, operation }, "Read failed");
    return READ_FAILED_MESSAGE;
}
