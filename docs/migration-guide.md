> **Status:** GraphQL is now the default data layer. This guide is retained for reference but the migration is complete.

# REST to GraphQL Migration Guide

This guide covers migrating dev-health-web components from REST API to GraphQL.

## Overview

The frontend now defaults to GraphQL for analytics queries. This migration provides:

- **Better performance** - Batch queries reduce round trips
- **Real-time updates** - Subscriptions eliminate polling
- **Type safety** - Zod validation catches API mismatches
- **Simpler code** - urql hooks replace manual fetch logic

## Migration Steps

### 1. Replace API Calls

**Before (REST):**

```tsx
import { apiClient } from '@/lib/apiClient';

async function fetchData() {
  const response = await apiClient.postJson('/api/v1/investment', {
    filters: { ... }
  });
  return response;
}
```

**After (GraphQL):**

```tsx
import { useAnalytics } from '@/lib/graphql/hooks';

function MyComponent() {
  const { data, loading, error } = useAnalytics({
    orgId: 'my-org',
    batch: {
      breakdowns: [{ dimension: 'THEME', measure: 'COUNT', ... }],
      timeseries: [],
    },
  });

  // data is already typed and cached
}
```

### 2. Update Filter Components

**Before:**

```tsx
const [teams, setTeams] = useState([]);

useEffect(() => {
    fetch("/api/v1/filters/options")
        .then((r) => r.json())
        .then((d) => setTeams(d.teams));
}, []);
```

**After:**

```tsx
import { useDimensionValues } from "@/lib/graphql/hooks";

function TeamFilter() {
    const { values, loading } = useDimensionValues({
        orgId: "my-org",
        dimension: "TEAM",
    });

    // values = [{ value: 'Team A', count: 10 }, ...]
}
```

### 3. Add Real-time Updates

**Before (polling):**

```tsx
useEffect(() => {
    const interval = setInterval(refetch, 60000);
    return () => clearInterval(interval);
}, []);
```

**After (subscription):**

```tsx
import { useMetricsUpdated } from "@/lib/graphql/hooks";

function Dashboard() {
    useMetricsUpdated({
        orgId: "my-org",
        onUpdate: () => refetch(),
    });
}
```

### 4. Wrap with Provider

Ensure your component tree has the GraphQL provider:

```tsx
// app/layout.tsx or page wrapper
import { GraphQLProvider } from "@/lib/graphql/provider";

export default function Layout({ children }) {
    return <GraphQLProvider orgId={currentOrgId}>{children}</GraphQLProvider>;
}
```

### 5. Add Validation (Optional)

For development, add Zod validation to catch API changes:

```tsx
import { validateAnalyticsResponse } from "@/lib/graphql/validate";

function useValidatedAnalytics(options) {
    const result = useAnalytics(options);

    useEffect(() => {
        if (result.data && process.env.NODE_ENV === "development") {
            const validation = validateAnalyticsResponse(result.data);
            if (!validation.success) {
                console.warn("Analytics response validation failed:", validation.error);
            }
        }
    }, [result.data]);

    return result;
}
```

## Component Examples

### Investment Chart

**Before:**

```tsx
function InvestmentChart({ filters }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        apiClient
            .postJson("/api/v1/investment", { filters })
            .then(setData)
            .finally(() => setLoading(false));
    }, [filters]);

    if (loading) return <Spinner />;
    return <Chart data={data.breakdown} />;
}
```

**After:**

```tsx
function InvestmentChart({ filters }) {
    const { data, loading } = useBreakdown({
        orgId: filters.orgId,
        dimension: "THEME",
        measure: "COUNT",
        startDate: filters.startDate,
        endDate: filters.endDate,
        topN: 10,
    });

    if (loading) return <Spinner />;
    return <Chart data={data?.breakdowns[0]?.items ?? []} />;
}
```

### Sankey Flow

**Before:**

```tsx
function FlowDiagram({ filters }) {
    const [sankey, setSankey] = useState(null);

    useEffect(() => {
        apiClient
            .postJson("/api/v1/sankey", {
                path: ["theme", "team"],
                filters,
            })
            .then(setSankey);
    }, [filters]);

    return <SankeyChart nodes={sankey?.nodes} edges={sankey?.edges} />;
}
```

**After:**

```tsx
function FlowDiagram({ filters }) {
    const { data, loading } = useSankey({
        orgId: filters.orgId,
        path: ["THEME", "TEAM"],
        measure: "COUNT",
        startDate: filters.startDate,
        endDate: filters.endDate,
    });

    return <SankeyChart nodes={data?.sankey?.nodes ?? []} edges={data?.sankey?.edges ?? []} />;
}
```

## Fallback to REST

If needed, disable GraphQL via environment variable:

```bash
NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS=false
```

Or check programmatically:

```tsx
import { runtimeConfig } from "@/lib/runtimeConfig";

if (runtimeConfig.useGraphQLAnalytics()) {
    // Use GraphQL
} else {
    // Use REST
}
```

## Testing

Update tests to mock urql instead of fetch:

```tsx
import { Provider } from "urql";
import { fromValue } from "wonka";

const mockClient = {
    executeQuery: () =>
        fromValue({
            data: { analytics: mockData },
        }),
};

render(
    <Provider value={mockClient}>
        <MyComponent />
    </Provider>,
);
```

## Checklist

- [ ] Wrap app with `GraphQLProvider`
- [ ] Replace `apiClient` calls with urql hooks
- [ ] Update filter components to use `useDimensionValues`
- [ ] Add subscriptions for real-time updates
- [ ] Remove polling logic
- [ ] Add Zod validation in development
- [ ] Update tests to mock urql
- [ ] Test with GraphQL disabled as fallback
