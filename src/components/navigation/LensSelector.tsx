"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FilterPills } from "@/components/shared/FilterPills";
import type { FilterPillOption } from "@/components/shared/FilterPills";
import {
	getLensConfig,
	getLensFromSearchParams,
	LENS_IDS,
} from "@/lib/lensContext";
import type { LensId } from "@/lib/lensContext";

export function LensSelector() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const activeLens =
		getLensFromSearchParams(new URLSearchParams(searchParams.toString())) ??
		"neutral";

	const handleSelect = useCallback(
		(lens: LensId) => {
			const params = new URLSearchParams(searchParams.toString());
			// Remove legacy role= to avoid dual params on the URL.
			params.delete("role");
			if (lens === "neutral") {
				params.delete("lens");
			} else {
				params.set("lens", lens);
			}
			const qs = params.toString();
			router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
		},
		[pathname, router, searchParams],
	);

	const options: FilterPillOption<LensId>[] = LENS_IDS.map((lensId) => {
		const config = getLensConfig(lensId);
		return {
			id: lensId,
			label: lensId === "neutral" ? "Default" : config.shortLabel,
			title: lensId === "neutral" ? "No reframing" : config.framing,
		};
	});

	return (
		<div data-testid="lens-selector">
			<FilterPills
				options={options}
				value={activeLens}
				onChange={handleSelect}
				ariaLabel="Lens"
				leadingLabel="Lens"
			/>
		</div>
	);
}
