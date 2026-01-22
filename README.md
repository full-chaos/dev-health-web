# Dev Health Web
[Demo](https://demo.fullchaos.studio)
This is the application frontend for [dev-health-ops](https://github.com/chrisgeo/dev-health-ops).

## Getting Started

To run the full stack locally:

1. Start ClickHouse (from `dev-health-ops`):

```bash
dev-hops grafana up
```

2. Run the API:

```bash
dev-hops api --db "clickhouse://localhost:8123/default" --reload
```

3. Run the web app with the API base set:

```bash
BACKEND_URL="http://127.0.0.1:8000" npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Documentation

- `docs/visualizations.md` explains when to use heatmaps vs line charts, and flame diagrams vs cycle time.
- `docs/hosting.md` covers demo exports, GitHub Pages, and CDN hosting.

## Frontend Only

You can still run the frontend alone:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```
![Arc 2026-01-20 11 00 22](https://github.com/user-attachments/assets/8e823e44-2388-477a-bba5-3bd64efde538)
