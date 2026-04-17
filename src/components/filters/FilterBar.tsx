/**
 * FilterBar — RSC + Client hybrid wrapper.
 *
 * This server component resolves static configuration (visibility flags and
 * scope lock) based on the `view` and `tab` props, then passes the computed
 * values to the interactive FilterBarClient component.
 */

import { Suspense } from "react";
import { FilterBarClient } from "./FilterBarClient";
import {
  type FilterBarClientProps,
  type FilterBarView,
  resolveScopeLock,
  resolveVisibility,
} from "./filterBarConfig";

type FilterBarProps = {
  condensed?: boolean;
  view?: FilterBarView;
  tab?: string;
};

export function FilterBar({ condensed, view, tab }: FilterBarProps) {
  const resolvedVisibility = resolveVisibility(view, tab);
  const resolvedScopeLock = resolveScopeLock(view);

  const clientProps: FilterBarClientProps = {
    condensed,
    view,
    tab,
    resolvedVisibility,
    resolvedScopeLock,
  };

  return (
    <Suspense fallback={<div className="h-14 animate-pulse rounded-xl bg-(--card-80)" />}>
      <FilterBarClient {...clientProps} />
    </Suspense>
  );
}
