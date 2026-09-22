# CHAOS-6274 visual evidence

acr device approval page (`/acr/device`) — fallback typed-entry state vs
`?user_code=` prefill from acr's `verification_uri_complete` link.

- `02-device-fallback-empty.png` — no query param, empty input, button disabled.
- `03-device-prefilled.png` — `?user_code=EP23TUGG`, prefilled input, button enabled.
