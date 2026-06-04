"use client";

import { useEffect, useState } from "react";

import { apiClient } from "@/lib/apiClient";
import { logger } from "@/lib/logger";
import { EMPTY_FILTER_OPTIONS, type FilterOptions } from "./filterBarUtils";

/**
 * Shared option source for every filter surface.
 *
 * Fetches the canonical team/repo/developer/etc. lists from
 * `/api/v1/filters/options` so the page FilterBar and the GlobalContextBar
 * draw from the SAME source instead of hardcoding lists. Failures fall back to
 * the empty option set (the menus then explain "No options yet").
 */
export function useFilterOptions(): FilterOptions {
	const [options, setOptions] = useState<FilterOptions>(EMPTY_FILTER_OPTIONS);

	useEffect(() => {
		let active = true;

		apiClient
			.getJson<FilterOptions>("/api/v1/filters/options")
			.then((payload) => {
				if (!active) {
					return;
				}

				setOptions({
					teams: payload.teams ?? [],
					repos: payload.repos ?? [],
					services: payload.services ?? [],
					developers: payload.developers ?? [],
					work_category: payload.work_category ?? [],
					issue_type: payload.issue_type ?? [],
					flow_stage: payload.flow_stage ?? [],
				});
			})
			.catch((err) => {
				if (active) {
					logger.warn(
						{ err },
						"useFilterOptions: failed to load filter options",
					);
					setOptions((prev) => ({ ...prev }));
				}
			});

		return () => {
			active = false;
		};
	}, []);

	return options;
}
