// Re-exports and type aliases bridging codegen output types to the component layer.
// Wave 1 badge components type severity/source/state as narrow union literals;
// the codegen types use plain string scalars. We preserve the original type names
// as aliases over the codegen types so call sites require no changes, while
// also narrowing string → literal for badge safety via intersection.

import type {
  SecurityAlertNode,
  SeverityBucket,
  RepoAlertCount,
  TrendPoint,
} from "@/lib/graphql/__generated__/types";
import type {
  SecuritySeverity,
  SecuritySource,
  SecurityState,
} from "@/lib/filters/security";

// SecurityAlertRowData narrows the plain-string severity/source/state fields
// back to the union literals the badge components expect. At runtime these will
// always match because the backend emits lowercase values.
export type SecurityAlertRowData = Omit<
  SecurityAlertNode,
  "severity" | "source" | "state"
> & {
  severity: SecuritySeverity;
  source: SecuritySource;
  state: SecurityState;
};

export type SeverityBucketData = Omit<SeverityBucket, "severity"> & {
  severity: SecuritySeverity;
};

export type RepoAlertCountData = RepoAlertCount;
export type TrendPointData = TrendPoint;
