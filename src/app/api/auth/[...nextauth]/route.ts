import { handlers as authJsHandlers } from "@/lib/auth";
import { browserSafeAuthHandlers } from "@/lib/authBrowserSession";
import { authCallbackRefusals } from "@/lib/authCallbackRefusal";

// CHAOS-12088: the browser gets the session without the Ops tokens, and cannot write tokens into it.
// CHAOS-13653: a failed state or PKCE check at the OAuth callback lands on the sign-in page, not on Configuration.
const handlers = authCallbackRefusals(browserSafeAuthHandlers(authJsHandlers));
export const { GET, POST } = handlers;
