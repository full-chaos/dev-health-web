import "server-only";
import { NextResponse } from "next/server";
import { sealSsoTicket, signIn } from "@/lib/auth";
import { wireConfigFromEnv } from "@/lib/authServiceWire";
import {
    completeOidc,
    completeSaml,
    ssoEnabled,
    startOidc,
    startSaml,
    type SsoCompleteResult,
    type SsoFailureCode,
} from "@/lib/authSso";
import { getServerEnv } from "@/lib/config";
import { safePostLoginRedirect } from "@/lib/post-login-redirect";

// The browser side of enterprise SSO (CHAOS-13035, CHAOS-10878): the start routes, the OIDC
// callback and the SAML ACS. The backend cookies are bound to exact paths of the web origin, so
// `sso_return` (the validated return target) is bound to the same path and cleared on every
// outcome. With the switch off every route answers 404 before any backend call.

export type SsoProtocol = "oidc" | "saml";

const PROVIDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETURN_COOKIE = "sso_return";
const RETURN_MAX_AGE_SECONDS = 600;
const COOKIE_PREFIX: Record<SsoProtocol, string> = {
    oidc: "dho_oidc_login_nonce_",
    saml: "dho_saml_login_nonce_",
};
const NO_STORE = "private, no-store";

const callbackPath = (protocol: SsoProtocol, providerId: string): string =>
    protocol === "oidc"
        ? `/api/v1/auth/oidc/${providerId}/callback`
        : `/api/v1/auth/saml/${providerId}/acs`;

// The SAML ACS is reached by a cross-site POST from the IdP: only a SameSite=None cookie rides it.
const sameSite = (protocol: SsoProtocol): "None" | "Lax" => (protocol === "saml" ? "None" : "Lax");

const returnCookie = (protocol: SsoProtocol, providerId: string, target: string): string =>
    `${RETURN_COOKIE}=${encodeURIComponent(target)}; Path=${callbackPath(protocol, providerId)}; Max-Age=${RETURN_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=${sameSite(protocol)}`;

const clearReturnCookie = (protocol: SsoProtocol, providerId: string): string =>
    `${RETURN_COOKIE}=; Path=${callbackPath(protocol, providerId)}; Max-Age=0; HttpOnly; Secure; SameSite=${sameSite(protocol)}`;

// Behind a proxy the request URL is internal: the configured origin wins, as for the Ask Dev check.
function webOrigin(request: Request): string {
    const env = getServerEnv();
    const configured = env.AUTH_URL ?? env.NEXTAUTH_URL;
    if (configured !== undefined) {
        try {
            return new URL(configured).origin;
        } catch {
            // fall through to the request's own origin
        }
    }
    return new URL(request.url).origin;
}

function withCookies(response: NextResponse, setCookies: readonly string[]): NextResponse {
    for (const line of setCookies) response.headers.append("set-cookie", line);
    response.headers.set("Cache-Control", NO_STORE);
    return response;
}

const notFound = (): NextResponse =>
    new NextResponse(null, { status: 404, headers: { "Cache-Control": NO_STORE } });

function failure(
    origin: string,
    code: SsoFailureCode,
    setCookies: readonly string[],
): NextResponse {
    const url = new URL("/auth/signin", origin);
    url.searchParams.set("error", code);
    return withCookies(NextResponse.redirect(url, 303), setCookies);
}

function cookieValue(header: string | null, name: string): string | undefined {
    for (const part of (header ?? "").split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === name) return rest.join("=");
    }
    return undefined;
}

function returnTarget(header: string | null): string | undefined {
    const raw = cookieValue(header, RETURN_COOKIE);
    if (raw === undefined) return undefined;
    try {
        return safePostLoginRedirect(decodeURIComponent(raw));
    } catch {
        return undefined;
    }
}

// A callback takes the login-nonce cookie of its own protocol and nothing else from the request.
function bindingCookies(header: string | null, protocol: SsoProtocol): string | undefined {
    const kept = (header ?? "")
        .split(";")
        .map((part) => part.trim())
        .filter((part) => part.startsWith(COOKIE_PREFIX[protocol]));
    return kept.length === 0 ? undefined : kept.join("; ");
}

export async function ssoStart(
    request: Request,
    protocol: SsoProtocol,
    providerId: string,
): Promise<NextResponse> {
    if (!ssoEnabled()) return notFound();
    const origin = webOrigin(request);
    if (!PROVIDER_ID.test(providerId)) return failure(origin, "sso_failed", []);
    const cfg = wireConfigFromEnv();
    const result =
        protocol === "oidc"
            ? await startOidc(
                  { providerId, redirectUri: `${origin}${callbackPath("oidc", providerId)}` },
                  cfg,
              )
            : await startSaml({ providerId }, cfg);
    if (result.kind === "disabled") return notFound();
    if (result.kind === "refused") return failure(origin, result.code, []);
    const target = safePostLoginRedirect(new URL(request.url).searchParams.get("callbackUrl"));
    return withCookies(NextResponse.redirect(result.redirectUrl, 303), [
        ...result.setCookies,
        ...(target === undefined ? [] : [returnCookie(protocol, providerId, target)]),
    ]);
}

async function finish(
    origin: string,
    result: SsoCompleteResult,
    target: string | undefined,
    cleared: string,
): Promise<NextResponse> {
    if (result.kind === "disabled") return notFound();
    if (result.kind === "refused") {
        return failure(origin, result.code, [...result.clearCookies, cleared]);
    }
    const cookies = [...result.clearCookies, cleared];
    try {
        const ticket = await sealSsoTicket(result.session);
        const signedIn: unknown = await signIn("sso", { ticket, redirect: false });
        // With redirect:false a refused credential comes back as a URL carrying `error`, not a throw.
        if (typeof signedIn === "string" && new URL(signedIn, origin).searchParams.has("error")) {
            return failure(origin, "sso_failed", cookies);
        }
    } catch {
        return failure(origin, "sso_failed", cookies);
    }
    return withCookies(
        NextResponse.redirect(new URL(target ?? "/dashboard", origin), 303),
        cookies,
    );
}

export async function ssoCompleteOidc(request: Request, providerId: string): Promise<NextResponse> {
    if (!ssoEnabled()) return notFound();
    const origin = webOrigin(request);
    if (!PROVIDER_ID.test(providerId)) return failure(origin, "sso_failed", []);
    const cleared = clearReturnCookie("oidc", providerId);
    const cookieHeader = request.headers.get("cookie");
    const query = new URL(request.url).searchParams;
    const code = query.get("code");
    const state = query.get("state");
    if (query.has("error") || !code || !state) return failure(origin, "sso_failed", [cleared]);
    const result = await completeOidc(
        { providerId, code, state, cookies: bindingCookies(cookieHeader, "oidc") },
        wireConfigFromEnv(),
    );
    return finish(origin, result, returnTarget(cookieHeader), cleared);
}

export async function ssoCompleteSaml(request: Request, providerId: string): Promise<NextResponse> {
    if (!ssoEnabled()) return notFound();
    const origin = webOrigin(request);
    if (!PROVIDER_ID.test(providerId)) return failure(origin, "sso_failed", []);
    const cleared = clearReturnCookie("saml", providerId);
    const cookieHeader = request.headers.get("cookie");
    let samlResponse: FormDataEntryValue | null = null;
    let relayState: FormDataEntryValue | null = null;
    try {
        const form = await request.formData();
        samlResponse = form.get("SAMLResponse");
        relayState = form.get("RelayState");
    } catch {
        return failure(origin, "sso_failed", [cleared]);
    }
    if (typeof samlResponse !== "string" || samlResponse === "") {
        return failure(origin, "sso_failed", [cleared]);
    }
    const result = await completeSaml(
        {
            providerId,
            samlResponse,
            ...(typeof relayState === "string" && relayState !== "" ? { relayState } : {}),
            cookies: bindingCookies(cookieHeader, "saml"),
        },
        wireConfigFromEnv(),
    );
    return finish(origin, result, returnTarget(cookieHeader), cleared);
}
