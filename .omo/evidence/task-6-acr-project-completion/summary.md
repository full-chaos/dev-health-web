# Context Packet Explorer visual evidence

- `context-packet-375.png`: final enabled sample-state mobile capture after submitting an edited goal and expanding evidence; content renders before the collapsed navigation control.
- `context-packet-768.png`: final enabled sample-state tablet capture; the authorized repository selector and branch-or-commit field share a row.
- `context-packet-1280.png`: final enabled sample-state desktop capture; independently stacked category columns and diagnostics expose freshness, coverage, budget, compatibility, checks, next steps, and sanitized evidence disclosure.

Manual browser checks at 375/768/1280 used Agent Context Runtime test mode. The Context Packet entry selects Diagnose; the form uses a server-authorized repository selector; invalid submission focuses the Goal field and associates its inline error; edited submission renders the submitted goal; and Space opens a named, sanitized evidence region. Focused Playwright coverage asserts sample, not-entitled, loading, empty, and error states; invalid focus; keyboard disclosure; no unexpected console/page errors or failed requests; and zero `/api/v1/agent-context` requests.
