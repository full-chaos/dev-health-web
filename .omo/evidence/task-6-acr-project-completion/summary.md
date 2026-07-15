# Context Packet Explorer visual evidence

- `context-packet-375.png`: fresh enabled sample-state mobile capture; the form stacks and the sidebar stays compact and scrollable.
- `context-packet-768.png`: fresh enabled sample-state tablet capture; the authorized repository selector and branch-or-commit field share a row.
- `context-packet-1280.png`: fresh enabled sample-state desktop capture; category groups use two columns and diagnostics expose freshness, coverage, budget, checks, next steps, and sanitized evidence disclosure.

Manual browser checks used the authenticated mock test surface with Agent Context Runtime test mode enabled. The Context Packet entry selects Diagnose; the form uses a server-authorized repository selector; the evidence disclosure exposes only sanitized fixture fields; and sample submission completes after the polite loading state, restores focus to the generated packet, and re-enables its action. Automated Playwright coverage exercises sample, not-entitled, loading, empty, and error states with the same zero-ACR-request assertion.
