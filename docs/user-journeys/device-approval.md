# Approving a device login (acr-mcp)

This guide is for two readers. The user section shows how you approve or deny a sign-in that a
command line tool or an MCP client (for example acr-mcp) started. The admin section lists what the
web deployment needs so that the approval works. For the token and key detail, see
[auth-acr-device-approval.md](../auth-acr-device-approval.md).

## For users: approve or deny a login

The tool in your terminal shows a short code of 8 characters and a link to the approval page
(`/acr/device`). The link can already hold the code.

1. Open the link. If you are not signed in, the app sends you to the sign-in page and brings you
   back to the approval page after you sign in. A code in the link stays in the link.
   You need an organization. A session with no organization also goes to the sign-in page.
2. The page "Approve device access" shows one field, "Verification code". If the link held a valid
   code, the field is filled. Otherwise type the code. The field turns letters to upper case and
   takes 8 characters.
3. Choose "Preview request". The page "Review device access" opens. It shows:
    - "All organization repositories": the device can read context from all current and future
      repositories in your organization. Access never extends to another organization.
    - "Requested access": the code and the list of access items that the device asks for, each
      with a plain name and its technical name. The list is not shown when the device asks for
      nothing in particular.
4. Choose "Confirm" to approve. The page shows "Approval complete". Go back to your terminal; the
   tool finishes its sign-in there.
5. To stop, choose "Back" and close the page, or do not confirm. A denial is the absence of a
   confirm: the tool gets no credential and its code runs out. Start again in the terminal when
   you want a new code.

The approval always asks for access to all repositories of your organization. The page has no
control to narrow the repositories.

### What the page can tell you

| You see                                        | Meaning and next step                                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| "This code is no longer valid..."              | The code expired, was used already, or was typed wrong. The service gives one answer for all three. Check the code, or start again in the terminal. |
| "Code expired"                                 | The page shows this only when the service answers with a 410 status. Start again in the terminal.                                                   |
| "Request not approved"                         | The service refused the request (403 or 409), or you are impersonating another organization. Start again in the terminal.                           |
| "Approval is unavailable for this account."    | Your account may not approve a device. Ask an organization admin.                                                                                   |
| "Approval is unavailable while impersonating." | An impersonation session cannot approve. End the impersonation and try again.                                                                       |
| "Agent Context Runtime is not available..."    | The organization has no Agent Context Runtime feature. Ask an organization admin.                                                                   |
| "Too many attempts. Please wait..."            | A rate limit stopped the request. Wait one minute, then try again.                                                                                  |
| "We could not reach the approval service."     | A network or service failure. Try again.                                                                                                            |

A code lives 10 minutes (see [auth-acr-device-approval.md](../auth-acr-device-approval.md)). If you
wait longer, the preview or the confirm gives the "no longer valid" message.

## For admins: what to configure

The web server signs a short assertion for each preview and each approval, and the ACR service
checks it. Both sides must agree on the key and the origin.

### Web assertion key

- Web needs a private signing key as a file, mounted from a Kubernetes Secret. The settings that
  point to it are `ACR_WEB_ASSERTION_KEY_FILE` (the file), `ACR_WEB_ASSERTION_KID` (the key name),
  `ACR_WEB_ASSERTION_ISSUER` and `ACR_WEB_ASSERTION_AUDIENCE`, and `ACR_API_ORIGIN` (the ACR
  address). If one is missing or wrong, the approval fails with "Agent Context Runtime is not
  configured."
- The key must be an Ed25519 key. The file must be 1 byte to 16 KiB, must not be a link, and must
  not allow any group or other permission. Web reads the file on each request, so a new key file
  works without a restart.
- ACR needs the matching public key set from a second Secret. In the production deploy values the
  comments name the web Secret `acr-web-assertion-key` and the ACR Secret `acr-web-assertion-jwks`;
  the ACR `webAssertion` values hold the issuer (the public web address) and the audience
  (`acr-api`). The issuer and audience on both sides must be equal.
- To rotate the key, follow "Rotating the web assertion key" in
  [auth-endpoint-profiles.md](../auth-endpoint-profiles.md). Never write a key value in a ticket, a
  chat or a document.

### AUTH_URL

The approval route accepts a request only when its `Origin` header equals the web origin. Web takes
that origin from `AUTH_URL` (or the older `NEXTAUTH_URL`). Without both, it uses the origin of the
request. Set `AUTH_URL` to the public address of the web app, for example the one users type in the
browser. See [env-vars.md](../env-vars.md).

### ACR side

The ACR deploy values must give the device verification address that points to the web page
`/acr/device`, so that the tool prints the right link.

### Optional switches

- `ACR_SCOPES_FROM_GRANTS` on web makes the policy service decide each approval. The setting and
  its effects are in [auth-acr-device-approval.md](../auth-acr-device-approval.md), section 6.
  Do not turn it on or off without a roll plan.

## Troubleshooting

| Symptom                                                                                    | Likely cause                                                                                                                                 | Check                                                                                                        |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The preview or confirm answers 403 "Request rejected."                                     | Origin mismatch: the `Origin` header of the browser is not the web origin. A proxy that rewrites the host, or a wrong `AUTH_URL`, causes it. | Compare `AUTH_URL` with the address in the browser bar. Both must have the same scheme, host and port.       |
| "This code is no longer valid..."                                                          | Expired code (10 minutes), a code used already, or a typing error. The service does not say which.                                           | Ask the user to start again in the terminal and to approve within a few minutes.                             |
| "Too many attempts."                                                                       | Web allows 20 requests a minute for each client address and 5 a minute for each client and code.                                             | Wait one minute.                                                                                             |
| "Agent Context Runtime is not configured." (or 503 "Approval is temporarily unavailable.") | A web setting or the key file is missing or wrong, or ACR did not answer.                                                                    | Check the settings above and the permissions of the key file. Read the web log for a configuration line.     |
| 403 "Approval is unavailable for this account."                                            | The policy service refused the approval for this person.                                                                                     | See [auth-acr-device-approval.md](../auth-acr-device-approval.md), section 7.                                |
| The user lands on the sign-in page again and again                                         | The session has no organization.                                                                                                             | The user must finish onboarding. See [Signing in, sessions and organizations](sign-in-sessions-and-orgs.md). |
