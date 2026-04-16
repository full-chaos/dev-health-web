/**
 * ECharts tree-shaking entry point.
 *
 * Import from this module instead of "echarts" to avoid bundling the full
 * ~1 MB ECharts library. Only the cross-cutting components needed by every
 * chart are registered here.
 *
 * Usage:
 *   import { echarts } from "@/lib/echartsInit";
 *   import { BarChart } from "echarts/charts";
 *   echarts.use([BarChart]);
 *
 * Chart-type registrations (BarChart, LineChart, SankeyChart, etc.) live in
 * each individual chart component so pages that use only a subset of chart
 * types ship only those types. `echarts/core`.use(...) is idempotent, so
 * registering the same chart type in multiple components is safe.
 *
 * Registered here (cross-cutting only):
 *   - Grid, Tooltip, Legend, DataZoom
 *   - MarkArea, MarkLine, MarkPoint, VisualMap
 *   - CanvasRenderer
 */

import * as echarts from "echarts/core";

import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  VisualMapComponent,
} from "echarts/components";

import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export * from "echarts/core";
export { echarts };
