import type { PagerDutyAddProviderMethod } from "./addProviderWizardSteps";

type PagerDutyCredentialFieldsProps = {
    readonly method: PagerDutyAddProviderMethod;
};

export function PagerDutyCredentialFields({ method }: PagerDutyCredentialFieldsProps) {
    return (
        <>
            <div>
                <label
                    htmlFor="pagerduty-subdomain"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Account subdomain
                </label>
                <div className="mt-1">
                    <input
                        type="text"
                        name="subdomain"
                        id="pagerduty-subdomain"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                    />
                </div>
            </div>

            <div>
                <label
                    htmlFor="pagerduty-region"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Region
                </label>
                <div className="mt-1">
                    <select
                        name="region"
                        id="pagerduty-region"
                        defaultValue="us"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                    >
                        <option value="us">US</option>
                        <option value="eu">EU</option>
                    </select>
                </div>
            </div>

            {method === "pagerduty_client_credentials" ? (
                <>
                    <div>
                        <label
                            htmlFor="pagerduty-client-id"
                            className="block text-sm font-medium text-(--text-primary)"
                        >
                            Client ID
                        </label>
                        <div className="mt-1">
                            <input
                                type="text"
                                name="client_id"
                                id="pagerduty-client-id"
                                className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label
                            htmlFor="pagerduty-client-secret"
                            className="block text-sm font-medium text-(--text-primary)"
                        >
                            Client secret
                        </label>
                        <div className="mt-1">
                            <input
                                type="password"
                                name="client_secret"
                                id="pagerduty-client-secret"
                                className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                            />
                        </div>
                    </div>
                </>
            ) : null}

            {method === "pagerduty_api_token" ? (
                <div>
                    <label
                        htmlFor="pagerduty-api-token"
                        className="block text-sm font-medium text-(--text-primary)"
                    >
                        API token
                    </label>
                    <div className="mt-1">
                        <input
                            type="password"
                            name="api_token"
                            id="pagerduty-api-token"
                            className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        />
                    </div>
                </div>
            ) : null}
        </>
    );
}
