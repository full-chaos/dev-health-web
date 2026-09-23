# CHAOS-6317 evidence: expired device-code state

- `6317-expired-before.png` — baseline (pre-fix): code expires between Preview and Approve; the form silently reverts to "Approve device access" with the stale code still in the input and a generic "We could not approve this request." message. No indication the code expired.
- `6317-expired-after.png` — after the fix: the same scenario now shows "Code expired — This code has expired. Return to your terminal to request a new one."

Captured via a Playwright spec mocking acr's exact wire shape (`{error:{code:"invalid_request"}}`, HTTP 400) for the Approve call after a successful Preview.
