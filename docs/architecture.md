# Architecture Overview: dev-health-web

## Overview
- **Framework**: Next.js 16.1.6 (React Server Components)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI**: Custom components (no shadcn/radix)

## Route Groups
- **`(app)`**: Main authenticated shell.
  - **Layout**: `src/app/(app)/layout.tsx`. Wraps in `SessionProvider` + `GraphQLProvider`. Calls `requireSession()`.
  - **`admin/`**: Sub-group. Uses `requireRole(["admin", "owner"])` + `AdminSidebar`.
  - **`superadmin/`**: Sub-group. Uses `requireSuperuser()` + `SuperadminSidebar`.
  - **Dashboard**: `(app)/dashboard/page.tsx`.
- **`(auth)`**: Public auth flows (signin, onboard, error).
  - **Layout**: `src/app/(auth)/layout.tsx`. Includes `Toaster`.
- **`(marketing)`**: Public marketing landing.
  - **Layout**: `src/app/(marketing)/layout.tsx`. No auth required.
- **Root Layout**: `src/app/layout.tsx`. Sets fonts, theme script (prevents FOUC), includes `runtime-config.js`.

## Request Proxy
- **Middleware**: `src/proxy.ts` (Next.js 16 proxy, NOT `middleware.ts`).
- **Functionality**:
  - Auth redirects.
  - Rewrites `/api/` and `/graphql` to backend with `Authorization` bearer token.
  - `PUBLIC_PATHS` list defines unauthenticated routes.

## Data Fetching
- **REST**:
  - `src/lib/apiClient.ts`: Fetch wrapper with auto auth header (server-side).
  - `src/lib/api.ts`: Domain functions.
- **GraphQL (urql)**:
  - Provider: `src/lib/graphql/provider.tsx`.
  - Client: `src/lib/graphql/urqlClient.ts`.
  - Fallbacks: Feature-flagged GraphQL fallbacks in `api.ts`.
- **Server Components**: Direct `await` fetch.

## Navigation
- **PrimaryNav**: `src/components/navigation/PrimaryNav.tsx`. Main sidebar with collapsible groups.
- **ContextStrip**: Secondary navigation.
- **Settings Sidebars**: `AdminSidebar` and `SuperadminSidebar` for administrative contexts.

## Key Files Quick Reference
| Path | Description |
| :--- | :--- |
| `src/proxy.ts` | Central proxy and auth middleware |
| `src/app/layout.tsx` | Root layout (fonts, theme, runtime config) |
| `src/app/(app)/layout.tsx` | Authenticated shell layout and providers |
| `src/lib/apiClient.ts` | REST fetch wrapper |
| `src/lib/api.ts` | Domain API functions and fallbacks |
| `src/lib/graphql/urqlClient.ts` | GraphQL client config |
| `src/components/navigation/PrimaryNav.tsx` | Main sidebar navigation |
