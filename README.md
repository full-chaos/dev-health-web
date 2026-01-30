# Dev Health Web

[Demo](https://demo.fullchaos.studio)

This is the application frontend for [dev-health-ops](https://github.com/chrisgeo/dev-health-ops).

## Prerequisites

- Node.js 18+ (recommended: 20+)
- npm, yarn, pnpm, or bun

## Getting Started

### Full Stack (with Backend)

1. **Install dependencies:**

```bash
npm install
```

2. **Start ClickHouse** (from `dev-health-ops`):

```bash
dev-hops grafana up
```

3. **Run the API:**

```bash
dev-hops api --db "clickhouse://localhost:8123/default" --reload
```

4. **Run the web app:**

```bash
BACKEND_URL="http://127.0.0.1:8000" npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Frontend Only (Demo Mode)

You can run the frontend with sample data (no backend required):

```bash
npm install
npm run dev
```

This will serve the app at [http://localhost:3000](http://localhost:3000) using static sample data.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKEND_URL` | Backend API URL | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS` | Enable GraphQL analytics | `false` |
| `NEXT_PUBLIC_DEV_HEALTH_TEST_MODE` | Use sample data (for testing) | `false` |
| `NEXT_PUBLIC_DOCS_URL` | Documentation link URL | — |
| `DEMO_EXPORT` | Enable static export mode | `false` |
| `BASE_PATH` | Subpath for hosting (e.g., `/app`) | — |

Copy `.env.example` to `.env.local` and configure as needed.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test:unit` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run e2e tests (Playwright) |

## Documentation

- `docs/visualizations.md` — Chart selection guide (heatmaps, quadrants, flame diagrams)
- `docs/graphql-client.md` — urql GraphQL client usage
- `docs/graphql-investment.md` — Investment View GraphQL API
- `docs/hosting.md` — Demo exports, GitHub Pages, CDN hosting
- `docs/migration-guide.md` — REST to GraphQL migration

## Architecture

- **Framework:** Next.js 14+ with App Router
- **Components:** React Server Components + Client Components
- **Styling:** Tailwind CSS
- **Data:** urql GraphQL client, static sample data for demos
- **Testing:** Vitest (unit), Playwright (e2e)

![Screenshot](https://github.com/user-attachments/assets/8e823e44-2388-477a-bba5-3bd64efde538)
