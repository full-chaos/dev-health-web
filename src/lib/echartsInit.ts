/**
 * ECharts tree-shaking entry point.
 *
 * Import from this module instead of "echarts" to avoid bundling the full
 * ~1 MB ECharts library. Only the components actually used by this app are
 * registered here.
 *
 * Usage:
 *   import * as echarts from "@/lib/echartsInit";
 *   // then use echarts.init(), echarts.use(), etc.
 *
 * Registered components cover all chart types used in this codebase:
 *   - Bar (HorizontalBarChart, VerticalBarChart, StackedHorizontalBar)
 *   - Line / Area (TimeseriesChart, StackedAreaChart, ConfidenceBandChart, SparklineChart)
 *   - Scatter (QuadrantChart)
 *   - Pie / Sunburst / Treemap (DonutChart, InvestmentMixSunburst, TreemapChart,
 *                               NestedPieChart2D, NestedPieChart3D, SunburstChart)
 *   - Sankey (SankeyChart)
 *   - Heatmap (HeatmapChart, TransitionHeatmapChart)
 *   - Graph (WorkGraphExplorer)
 *   - Custom (FlameDiagram, HierarchicalFlameGraph)
 *   - Axes, grid, tooltip, legend, data-zoom, mark-area, mark-line
 */

import * as echarts from "echarts/core";

import { BarChart } from "echarts/charts";
import { LineChart } from "echarts/charts";
import { ScatterChart } from "echarts/charts";
import { PieChart } from "echarts/charts";
import { SunburstChart } from "echarts/charts";
import { TreemapChart } from "echarts/charts";
import { SankeyChart } from "echarts/charts";
import { HeatmapChart } from "echarts/charts";
import { GraphChart } from "echarts/charts";
import { CustomChart } from "echarts/charts";

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

// Register all required components once at module load time
echarts.use([
  // Charts
  BarChart,
  LineChart,
  ScatterChart,
  PieChart,
  SunburstChart,
  TreemapChart,
  SankeyChart,
  HeatmapChart,
  GraphChart,
  CustomChart,
  // Components
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  VisualMapComponent,
  // Renderer
  CanvasRenderer,
]);

// Re-export the echarts core so callers get the pre-initialised instance
export * from "echarts/core";
export { echarts };
