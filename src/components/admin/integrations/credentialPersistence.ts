import { createCredential } from "@/lib/admin/server";
import type { Provider } from "@/lib/admin/types";
import type { AddProviderMethod } from "./addProviderWizardSteps";
import {
    savePagerDutyApiToken,
    savePagerDutyClientCredentials,
} from "./pagerDutyCredentialActions";

type CredentialSaveInput = {
    readonly provider: Provider;
    readonly method: AddProviderMethod | null;
    readonly credentialName: string;
    readonly fields: Readonly<Record<string, string>>;
};

type CredentialSaveResult = {
    readonly error: string | null;
};

export async function saveAddProviderCredential(
    input: CredentialSaveInput,
): Promise<CredentialSaveResult> {
    if (input.provider === "pagerduty") {
        switch (input.method) {
            case "pagerduty_client_credentials": {
                const result = await savePagerDutyClientCredentials(input);
                return { error: result.error ?? null };
            }
            case "pagerduty_api_token": {
                const result = await savePagerDutyApiToken(input);
                return { error: result.error ?? null };
            }
            default:
                return { error: "Choose a PagerDuty credential method." };
        }
    }

    const result = await createCredential({
        provider: input.provider,
        name: input.credentialName || "default",
        credentials: input.fields,
    });
    return { error: result.error ?? null };
}
