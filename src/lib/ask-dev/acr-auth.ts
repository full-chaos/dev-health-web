import { getSession } from "next-auth/react";

import { configureAcrAuth } from "@full-chaos/ask-dev/acr-client";

import { browserAcrClientConfig } from "./acr-browser-config";
import "./acr-log";

export * from "@full-chaos/ask-dev/acr-client";

/**
 * Web's seams on the ACR token store, which is ask-dev's (CHAOS-12541): the session it binds a token
 * family to, the client, and web's two routes. Import the store from here, so these are set first.
 */

/** Web's same-origin route that runs `/authorize` from the signed-in session (CHAOS-12474). */
export const ACR_AUTHORIZE_ROUTE = "/api/ask-dev/authorize";

configureAcrAuth({
    config: browserAcrClientConfig,
    // No broadcast: a broadcast makes every other tab fetch its session again.
    session: () => getSession({ broadcast: false }),
    routes: { authorize: ACR_AUTHORIZE_ROUTE, session: "/api/auth/session" },
});
