# Release notes

## 2026-11-06

Web session validation now keeps the original backend check time when it uses a cached validation
answer. A cache hit no longer delays the next check. Forced sign-out is enforced on the first
session request due for validation, within 60 s of the last backend check when the backend can
answer. See the [authentication design and bound](auth-system.md#authentication-flow).

A drill now checks forced sign-out and session recovery after an auth-service restart. Reported
drill result: PASS. Both sessions of the deactivated user were signed out on reads at 61 s after
deactivation. The control user stayed signed in. The auth-service down/up checks used the same
cookie jar, with no cookie clear and no new sign-in.

One-time rollout effect: a cookie stamped by a cache hit in the previous release can skip one
validation check. This can add about 60 s, or about 120 s since its last real backend check. That
extra delay expires within 60 s of rollout. An idle session is checked on its next request; an
outage or retry backoff can still delay validation.

Operator steps: [session recovery](runbooks/session-recovery.md) and
[forced sign-out](runbooks/forced-sign-out.md).
