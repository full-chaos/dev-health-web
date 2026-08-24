import { describe, expect, it } from "vitest";
import { render } from "@/test/utils";
import type { Provider } from "@/lib/admin/types";
import { unresolvableCredentialKeys } from "@/lib/admin/credentialVocabulary";
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
 * Fields a form collects as sync SCOPE rather than credential material.
 * They ride along in the same payload but no credential resolver reads them,
 * which is its own reported drift and is not what this test is guarding.
 */
const SCOPE_FIELDS = new Set(["org", "group", "projects", "teams"]);

describe("Providers wizard credential forms", () => {
    it.each(WIZARD_FORMS)(
        "$provider submits only keys a credential resolver reads",
        ({ provider, render: renderForm }) => {
            const { container } = render(renderForm());

            const submitted = Object.fromEntries(
                [...container.querySelectorAll<HTMLElement>("[name]")]
                    .map((element) => element.getAttribute("name") as string)
                    .filter((name) => !SCOPE_FIELDS.has(name))
                    .map((name) => [name, ""]),
            );

            expect(Object.keys(submitted).length).toBeGreaterThan(0);
            expect(unresolvableCredentialKeys(provider, submitted)).toEqual([]);
        },
    );
});
