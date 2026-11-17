# Signing in, sessions and organizations

This guide shows how you sign in to Dev Health, what happens to your session, how you sign out,
and how organization flows work for a user and for an organization admin. It describes what the
web app does today. For the technical detail of authentication, see [auth-system.md](../auth-system.md).

## Sign in

1. Open the sign-in page (`/auth/signin`). Enter your email and password.
2. If your organization uses single sign-on, choose "Continue with single sign-on". The page shows
   this option only when single sign-on is turned on for the web app. The form asks for a Protocol
   (OpenID Connect or SAML) and a Provider ID. Your administrator shares the Provider ID.
3. The page can also show buttons for GitHub, Google or GitLab. It shows a button only when the
   administrator of the web app has set up that provider.
4. After a good sign-in, the page sends you on:
    - If you have no organization yet, or your setup is not finished, you go to the onboarding
      page (`/auth/onboard`).
    - If you came from a link that needed a sign-in, you go back to that link.
    - Otherwise you go to the dashboard (`/dashboard`).

If you are already signed in and open the sign-in page, the page sends you on at once to the same
places.

### Sign-in messages

| You see                                                                 | Meaning                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| "Invalid email or password"                                             | The email or the password is not right.                                   |
| "Too many failed login attempts. Your account is temporarily locked..." | Too many wrong passwords. Wait, then try again.                           |
| "Too many login attempts. Please try again later."                      | A rate limit stopped the request. Wait, then try again.                   |
| "Sign-in is temporarily unavailable. Please try again shortly."         | The sign-in service did not answer. Try again in a short time.            |
| A prompt to verify your email                                           | Your email is not verified yet. Open the verification link in your email. |
| "Account created successfully. Please sign in."                         | You just registered. Sign in now.                                         |

The sign-in page also links to "Forgot password?" and to the sign-up page.

## Sessions

- Your session lives in a sealed cookie in your browser. You stay signed in between visits.
- Almost every page needs a session. The public pages are the home page, pricing, privacy, terms,
  and the sign-in, sign-up, verify, error, forgot-password and reset-password pages.
- If you open a page without a valid session, the app sends you to the sign-in page. It adds the
  page you wanted as a return address, and brings you back after you sign in. The return address
  must be a path on this site; the app ignores any other address.
- If the sign-in check is slow, the app shows "Service temporarily unavailable. Try again." with a
  503 status. It does not sign you out. Reload the page after a few seconds.
- If an admin impersonation is ending and not yet closed, the app shows a short error page
  instead of the sign-in page. Open the next page again; the app retries the stop.

## Sign out

1. Open the account menu. It shows "Signed in as" and your email.
2. Choose "Sign out".

Sign-out runs these steps in this order. A failed step does not stop the next step.

1. It cancels the Ask Dev runs that this browser tab has live.
2. It revokes your session at the server, with one retry.
3. It revokes the browser's Ask Dev access, when the browser holds one.
4. It clears the Ask Dev state of this tab.
5. It ends the web session and shows the sign-in page.

If step 2 fails after the retry, the sign-in page shows: "Signed out on this device; other
sessions may stay active." The revoke call ends only the session of the credential in your sealed
cookie. A new sign-in makes a new session and does not end the session that failed to revoke.

## Organizations: what a user sees

- Most product pages belong to one organization. If you have no organization, the app sends you
  to onboarding (`/auth/onboard`) when you open one of those pages. Your account settings
  (`/settings`) work without an organization.
- Onboarding. The app asks the backend which step you are on. It sends you to the workspace step,
  the integration step or the complete step, or to the dashboard when you are done. If the backend
  does not answer, the page shows "We couldn't load your onboarding" and a retry button. It does
  not guess a step. When the guided flow is off, the page shows a single form, "Set up your
  workspace", where you create your organization.
- A team trial starts from a sign-up link with a plan and trial choice. The app keeps that choice
  through onboarding and then opens the trial checkout page.
- Settings. The account menu opens "Preferences" (`/settings`): your display settings and your
  password.
- Your role decides what you can open under "Admin Panel". A user without the admin or owner role
  who opens an admin page goes back to the dashboard.

## Organizations: what an organization admin does

An admin or owner opens "Admin Panel" in the account menu (`/org/admin`). The page is named
"Organization" and shows signals such as needs attention, connected sources, identity coverage and
active sync configurations. If a signal cannot load, the page says so and marks the other signals
as possibly partial.

Common tasks:

- Invite a person. Open the users area, choose to add a user, enter the email, pick a role
  (Member, Admin or Viewer), and send the invite. The page shows "Invite sent to" with the email.
  What happens when the person accepts the invite is backend behavior and this page does not show it.
- Open the organization settings (`/org/admin/settings`) for the profile, billing and security
  settings.
- Delete the organization. The settings page has a "Delete Organization" area. It shows a preview
  of what the deletion removes. Then you type the organization name to confirm. After the deletion
  the app signs you out.

Other admin areas are under `/org/admin`: AI (bring your own LLM), audit logs, identities,
integrations, IP allowlist, retention, single sign-on, sync, teams and users.

## Platform admin (superadmin) without an organization

A platform admin who has no organization does not use the product dashboard.

- At the home page (`/`), a signed-in platform admin with no organization goes to `/superadmin`.
  Other signed-in users go to `/dashboard`.
- When a platform admin with no organization opens a page that needs an organization, the app
  sends them to `/superadmin`. A regular user in the same case goes to onboarding.
- `/org/admin` also sends a platform admin with no organization to `/superadmin`.
- The account menu shows "Platform Admin" for platform admins. The platform admin pages work only
  when the platform admin is not impersonating another account.
