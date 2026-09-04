import { describe, expect, it } from "vitest";
import { render } from "@/test/utils";
import type { Provider } from "@/lib/admin/types";
import { unresolvableCredentialKeys } from "@/lib/admin/credentialVocabulary";
import { PROVIDER_PRIMARY_FIELD } from "./wizard/providerRequiredFields";
import { GitHubForm, GitLabForm, JiraForm, LinearForm, LaunchDarklyForm } from "./ProviderForms";

/**
 * Admin > Providers > <provider> > "Create New / Add New" — the wizard.
 *
 * Its Jira form submitted `token` for years while every resolver read
 * `api_token`, so a credential created here passed its connection test and
 * then authenticated no sync at all (CHAOS-4224). Nothing compared the
 * form's field names to the vocabulary that has to read them; this is that
 * comparison, swept across every provider so the next invented key fails a
 * test rather than a user.
 */
const WIZARD_FORMS: { provider: Provider; render: () => React.ReactElement }[] = [
    { provider: "github", render: () => <GitHubForm /> },
    { provider: "gitlab", render: () => <GitLabForm /> },
    { provider: "jira", render: () => <JiraForm /> },
    { provider: "linear", render: () => <LinearForm /> },
    { provider: "launchdarkly", render: () => <LaunchDarklyForm /> },
];

/**
 * Fields a form collects as sync SCOPE rather than credential material,
 * named per provider. They ride along in the same payload but no credential
 * resolver reads them — their own reported drift, and not what this test
 * guards.
 *
 * Per provider rather than one global set: a global exclusion means renaming
 * a provider's secret field to any excluded name makes it vanish from the
 * assertion instead of failing it, which is the shape of hole this whole
 * test exists to close.
 */
const SCOPE_FIELDS: Partial<Record<Provider, readonly string[]>> = {
    github: ["org"],
    gitlab: ["group"],
    jira: ["projects"],
    linear: ["teams"],
};

describe("Providers wizard credential forms", () => {
    it.each(WIZARD_FORMS)(
        "$provider submits only keys a credential resolver reads",
        ({ provider, render: renderForm }) => {
            const { container } = render(renderForm());
            const scope = new Set(SCOPE_FIELDS[provider] ?? []);

            const submitted = Object.fromEntries(
                [...container.querySelectorAll<HTMLElement>("[name]")]
                    .map((element) => element.getAttribute("name") as string)
                    .filter((name) => !scope.has(name))
                    .map((name) => [name, ""]),
            );

            expect(Object.keys(submitted).length).toBeGreaterThan(0);
            expect(unresolvableCredentialKeys(provider, submitted)).toEqual([]);
        },
    );

    it.each(WIZARD_FORMS)(
        "$provider still offers the field its connection test gates on",
        ({ provider, render: renderForm }) => {
            // Without this, a form could pass the check above by dropping or
            // renaming its secret field into an excluded scope name: the key
            // disappears from the assertion rather than failing it.
            const { container } = render(renderForm());
            const names = [...container.querySelectorAll<HTMLElement>("[name]")].map((element) =>
                element.getAttribute("name"),
            );

            expect(names).toContain(PROVIDER_PRIMARY_FIELD[provider]);
        },
    );
});
