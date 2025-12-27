# Dev Health Web

This is the application frontend for [dev-health-ops](https://github.com/chrisgeo/dev-health-ops).

## Getting Started

To run the full stack locally:

1) Start ClickHouse (from `dev-health-ops`):

```bash
dev-hops grafana up
```

2) Run the API:

```bash
dev-hops api --db "clickhouse://localhost:8123/default" --reload
```

3) Run the web app with the API base set:

```bash
NEXT_PUBLIC_API_BASE="http://127.0.0.1:8000" npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

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
