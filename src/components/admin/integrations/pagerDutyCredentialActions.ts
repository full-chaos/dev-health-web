import {
    connectPagerDutyApiToken,
    connectPagerDutyClientCredentials,
    startPagerDutyOAuth,
} from "@/lib/admin/server";
import type { PagerDutyRegion } from "@/lib/admin/pagerduty";

type PagerDutyCredentialInput = {
    readonly credentialName: string;
    readonly fields: Readonly<Record<string, string>>;
};

function region(fields: Readonly<Record<string, string>>): PagerDutyRegion {
    return fields.region === "eu" ? "eu" : "us";
}

export function startPagerDutyOAuthCredential() {
    return startPagerDutyOAuth();
}

export function savePagerDutyClientCredentials(input: PagerDutyCredentialInput) {
    return connectPagerDutyClientCredentials({
        credentialName: input.credentialName || "default",
        clientId: input.fields.client_id?.trim() ?? "",
        clientSecret: input.fields.client_secret ?? "",
        region: region(input.fields),
        subdomain: input.fields.subdomain?.trim() ?? "",
    });
}

export function savePagerDutyApiToken(input: PagerDutyCredentialInput) {
    return connectPagerDutyApiToken({
        credentialName: input.credentialName || "default",
        apiToken: input.fields.api_token ?? "",
        region: region(input.fields),
        subdomain: input.fields.subdomain?.trim() ?? "",
    });
}
