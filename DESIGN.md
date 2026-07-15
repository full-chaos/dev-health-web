# ACR Contract Boundary Design

## 0. Research Log

- Existing design system: `docs/design-system.md` is binding; this boundary is server-only and introduces no rendered surface.
- Product boundary: `docs/agent-context-runtime-entitlement.md` confirms the web inspects entitlement state only and never treats a browser-selected organization or Dev Health license material as ACR authorization.

## 1. Brief

Keep ACR's REST wire contract reproducible and safely consumable by the Next.js server boundary. This work intentionally adds no customer UI, routes, styling, or browser-facing credential state.

## 2. Personas and Constraints

- Web operator: can inspect entitlement state but cannot create, infer, or authorize ACR access.
- Hosted ACR client: supplies its own credential; organization and repository scope remain server-validated.
- Security reviewer: must be able to verify that raw bearer tokens are excluded from DTOs and rejected by schema validation.

## 3. Design Tokens and Typography

No visual primitive is introduced. Any later ACR inspection UI inherits the existing semantic color roles, locked typography scale, 4px spacing scale, radius scale, and shared primitives from `docs/design-system.md`.

## 4. Interaction and Accessibility

There is no rendered interaction in this change. Future ACR UI must use customer-safe labels, must not expose raw credentials or internal endpoint details, and must preserve the entitlement and authorization boundary above.

## 5. Reusable Primitives

The reusable boundary primitives are non-visual: committed schema and example artifacts, a deterministic manifest, generated TypeScript DTOs, and strict Draft 2020-12 validation. No UI primitive is added or changed.

## 6. Motion and Responsive Behavior

Not applicable: this change has no rendered surface.

## 7. Verification and Accepted Debt

Verification is the contract CLI's generate/check flow, byte-stable output, golden validation, and raw-token rejection. No visual QA is required because no UI is rendered. There is no accepted design debt.
