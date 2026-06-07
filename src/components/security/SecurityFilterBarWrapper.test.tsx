import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { within } from "@testing-library/react";
import { cleanup, render, screen, userEvent } from "@/test/utils";

import {
	decodeSecurityFilter,
	defaultSecurityFilter,
	encodeSecurityFilter,
} from "@/lib/filters/security";
import { SecurityFilterBarWrapper } from "./SecurityFilterBarWrapper";

const mockReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
	usePathname: () => "/security",
	useRouter: () => ({
		replace: mockReplace,
		refresh: vi.fn(),
		push: vi.fn(),
		back: vi.fn(),
		forward: vi.fn(),
		prefetch: vi.fn(),
	}),
	useSearchParams: () => ({
		get: (key: string) => currentSearchParams.get(key),
		toString: () => currentSearchParams.toString(),
		has: (key: string) => currentSearchParams.has(key),
	}),
}));

function renderBar(
	encodedFilter = encodeSecurityFilter(defaultSecurityFilter()),
) {
	currentSearchParams = new URLSearchParams({ f: encodedFilter });
	return render(<SecurityFilterBarWrapper encodedFilter={encodedFilter} />);
}

function lastSecurityFilter() {
	const href = mockReplace.mock.calls.at(-1)?.[0] as string;
	const url = new URL(href, "https://dev-health.test");
	return decodeSecurityFilter(url.searchParams.get("f") ?? undefined);
}

describe("SecurityFilterBarWrapper", () => {
	beforeEach(() => {
		mockReplace.mockClear();
		currentSearchParams = new URLSearchParams();
	});

	afterEach(() => cleanup());

	it("renders FilterPills for severity, state, and source filters", () => {
		renderBar();

		expect(
			screen.getByRole("radiogroup", { name: "Security severity" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("radiogroup", { name: "Security state" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("radiogroup", { name: "Security source" }),
		).toBeInTheDocument();
	});

	it("updates the encoded security filter when a severity pill is selected", async () => {
		renderBar();

		await userEvent.click(screen.getByRole("radio", { name: "Critical" }));

		expect(mockReplace).toHaveBeenCalled();
		expect(lastSecurityFilter()).toMatchObject({
			openOnly: true,
			severities: ["critical"],
		});
	});

	it("shows multi-value severities as Multiple and lets All clear the narrowing", async () => {
		renderBar(
			encodeSecurityFilter({
				openOnly: true,
				severities: ["critical", "high"],
			}),
		);

		const severity = within(
			screen.getByRole("radiogroup", { name: "Security severity" }),
		);
		const multiple = severity.getByRole("radio", { name: /Multiple \(2\)/ });
		const all = severity.getByRole("radio", { name: "All" });
		expect(multiple).toHaveAttribute("aria-checked", "true");
		expect(all).toHaveAttribute("aria-checked", "false");

		await userEvent.click(all);

		expect(mockReplace).toHaveBeenCalled();
		expect(lastSecurityFilter()).toMatchObject({ openOnly: true });
		expect(lastSecurityFilter().severities).toBeUndefined();
	});
});
