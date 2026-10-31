import { serverAcrClientConfig } from "@/lib/acr/config";

/**
 * The client ID metadata document of web's first-party ACR browser client (CHAOS-12302, c1 of the
 * T13 split; Ask Dev direct browser design §2.1). ACR fetches it, with no credential, from this
 * public https URL, which is also the client's `client_id`, and pins it in
 * `ACR_OAUTH_BROWSER_CLIENTS`. ACR reads `client_id`, `client_name`, `redirect_uris` and
 * `token_endpoint_auth_method`; it needs Content-Type `application/json` and at most 5 KiB.
 *
 * Not found while the browser client is off (`ACR_OAUTH_ISSUER` unset) and on an http loopback
 * origin, where ACR uses its development-only static client and fetches no document.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
    const config = serverAcrClientConfig();
    if (config === undefined || !config.usesMetadataDocument) {
        return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const document = {
        client_id: config.clientId,
        client_name: "Dev Health",
        redirect_uris: [config.redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
    };
    return new Response(JSON.stringify(document), {
        status: 200,
        headers: {
            // Exactly this type: ACR refuses a document served as anything else.
            "Content-Type": "application/json",
            // ACR caches a document for 5 minutes; nothing here is per user.
            "Cache-Control": "public, max-age=300",
        },
    });
}
