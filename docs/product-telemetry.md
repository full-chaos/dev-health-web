# Product Telemetry Event Catalog

This document catalogs the product telemetry events emitted by `dev-health-web`. Product telemetry is used to understand how features are used, identify bottlenecks in the user experience, and prioritize product improvements.

## Privacy and Opt-out

Full Chaos Dev Health respects your privacy. Product telemetry is designed to be privacy-safe by default:

- **Do Not Track (DNT):** If your browser's "Do Not Track" setting is enabled, no product telemetry is emitted.
- **Local Opt-out:** You can disable product telemetry at any time in the **Settings > Preferences** section of the application. This setting is stored in your browser's local storage under the key `devhealth-product-telemetry-opt-out`.
- **Environment Flag:** The `NEXT_PUBLIC_TELEMETRY_ENABLED` environment variable can be used to disable telemetry globally for a deployment.

## Event Catalog

All events include a common envelope with the following fields:

| Field             | Type                 | Description                                                                                                                                                                           |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | `TelemetryEventName` | The name of the event.                                                                                                                                                                |
| `schemaVersion`   | `string`             | The version of the event schema (e.g., `2026-05-telemetry-v1`).                                                                                                                       |
| `eventId`         | `string`             | A unique UUID for the event.                                                                                                                                                          |
| `ts`              | `string`             | ISO 8601 timestamp of when the event occurred.                                                                                                                                        |
| `sessionId`       | `string`             | The identifier of the current session. It is shared by all tabs of a browser and changes after 30 minutes without a queued event (see [Session and delivery](#session-and-delivery)). |
| `anonymousUserId` | `string`             | A stable, anonymous identifier for the user.                                                                                                                                          |
| `orgIdHash`       | `string \| null`     | A salted hash of the organization ID.                                                                                                                                                 |
| `routePattern`    | `string \| null`     | The normalized route pattern where the event occurred.                                                                                                                                |

### `page_viewed`

Emitted when a user navigates to a new page.

| Payload Key            | Type             | Purpose                                 | Example Value                          |
| ---------------------- | ---------------- | --------------------------------------- | -------------------------------------- |
| `routePattern`         | `string`         | The normalized route pattern.           | `/people/[person_id]/metrics/[metric]` |
| `page`                 | `string`         | The display name of the page.           | `Developer Metrics`                    |
| `referrerRoutePattern` | `string \| null` | The route pattern of the previous page. | `/dashboard`                           |

### `feature_viewed`

Emitted once for each route view. `feature` is the first segment of the route pattern (`home` for the root route), never an id from the path.

| Payload Key    | Type     | Purpose                               | Example Value |
| -------------- | -------- | ------------------------------------- | ------------- |
| `feature`      | `string` | First segment of the route pattern.   | `investment`  |
| `surface`      | `string` | The UI surface. The value is `route`. | `route`       |
| `routePattern` | `string` | The normalized route pattern.         | `/investment` |

### `filter_changed`

Emitted when a user changes a filter. One event is sent for each filter dimension whose value really changed; an identical value sends nothing.

| Payload Key         | Type              | Purpose                                                                                                              | Example Value |
| ------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- | ------------- |
| `view`              | `string`          | The current view context.                                                                                            | `work_graph`  |
| `filterKey`         | `string`          | The filter that changed: `scope`, `date`, `repo`, `developer`, `work`, `flow`, `artifact`, `blocked` or `issueType`. | `scope`       |
| `valueCount`        | `number`          | The number of values selected in the filter.                                                                         | `3`           |
| `isCustomDateRange` | `boolean \| null` | Whether a custom date range is active.                                                                               | `true`        |

### `chart_interacted`

Emitted when a user interacts with a chart component.

| Payload Key | Type             | Purpose                                                                                    | Example Value |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------ | ------------- |
| `chart`     | `string`         | The type of chart: `quadrant`, `timeseries`, `treemap`, `flame` or `sankey`.               | `quadrant`    |
| `action`    | `string`         | The action: `point_selected`, `overlay_toggled`, `overlay_ignored`, `drilldown` or `zoom`. | `drilldown`   |
| `surface`   | `string`         | The UI surface containing the chart.                                                       | `dashboard`   |
| `scope`     | `string \| null` | The scope of the interaction.                                                              | `team_alpha`  |

### `navigation_interacted`

Emitted when a user interacts with the primary navigation.

| Payload Key | Type             | Purpose                                                             | Example Value        |
| ----------- | ---------------- | ------------------------------------------------------------------- | -------------------- |
| `group`     | `string`         | The navigation group ID.                                            | `engineering_health` |
| `item`      | `string \| null` | The navigation item ID.                                             | `dora_metrics`       |
| `action`    | `string`         | The action: `group_expanded`, `group_collapsed` or `item_selected`. | `item_selected`      |

### `guide_opened`

Emitted when a user opens an educational guide or help panel.

| Payload Key | Type     | Purpose                                    | Example Value              |
| ----------- | -------- | ------------------------------------------ | -------------------------- |
| `guide`     | `string` | The ID of the guide.                       | `understanding_cycle_time` |
| `surface`   | `string` | The UI surface where the guide was opened. | `metrics_page`             |

### `session_started`

Emitted when a new user session begins.

| Payload Key         | Type     | Purpose                                           | Example Value |
| ------------------- | -------- | ------------------------------------------------- | ------------- |
| `entryRoutePattern` | `string` | The route pattern where the user entered the app. | `/dashboard`  |

### `session_ended`

Emitted when the page becomes hidden or is closed (`visibilitychange` to hidden, then `pagehide`). Only one event is sent for each visible period: a hide followed by a `pagehide` counts once. The period starts again when the page is visible again or restored from the back-forward cache.

| Payload Key    | Type     | Purpose                                          | Example Value |
| -------------- | -------- | ------------------------------------------------ | ------------- |
| `durationMs`   | `number` | Total duration of the session in milliseconds.   | `1200000`     |
| `pagesViewed`  | `number` | Total number of pages viewed during the session. | `12`          |
| `interactions` | `number` | Total number of interactions recorded.           | `45`          |

### `client_error`

Emitted when a client-side error is caught by an error boundary, a window error handler or an unhandled promise rejection. It carries the error class name only, never the message or the stack. At most 20 are sent for each page load.

| Payload Key    | Type             | Purpose                                                                                       | Example Value |
| -------------- | ---------------- | --------------------------------------------------------------------------------------------- | ------------- |
| `boundary`     | `string`         | `route` for an error boundary, `global` for a window error or an unhandled promise rejection. | `route`       |
| `digest`       | `string \| null` | A unique hash of the error.                                                                   | `1234567890`  |
| `errorClass`   | `string`         | The class name of the error.                                                                  | `TypeError`   |
| `routePattern` | `string \| null` | The route pattern where the error occurred.                                                   | `/metrics`    |

## Session and delivery

- **Session id.** The id is stored in the browser's local storage and shared by all tabs. It is replaced by a new id when more than 30 minutes passed since the last queued event. If local storage is unavailable, one id is kept in memory for the page life.
- **Batching.** Events are queued and sent in batches: when 10 events are queued, and every 10 seconds. The queue holds at most 200 events; the oldest are dropped past that. A failed send is not retried.
- **Transport.** Each batch is sent to `/api/v1/product-telemetry/events` with `sendBeacon`, or with a `keepalive` request when the beacon is refused.
- **Page hide.** When the page is hidden or closed, the queue is sent at once. The newest events that fit a 56 KB budget are sent; older events stay queued and are sent by the timer if the page survives.
- **Reader window.** The product telemetry pages in the platform admin area (`/superadmin/product-telemetry`) read a 30-day window by default that includes today.

## Forbidden Fields (Sanitizer Blocklist)

The following fields are strictly forbidden and are automatically stripped from all telemetry payloads before emission:

- `email`
- `name`
- `username` / `userName`
- `userId`
- `orgId` (use `orgIdHash` instead)
- `url` / `href` (use `routePattern` instead)
- `query` / `search`
- `stack`
- `message`
- `title`
- `body`

No free-form text entered by users is ever collected.
