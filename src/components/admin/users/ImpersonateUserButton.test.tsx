import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@/test/utils";
import { ImpersonateUserButton } from "./ImpersonateUserButton";
import type { User } from "@/lib/admin/types";

// useSession is read for the ACTOR (the logged-in admin). A mutable holder lets
// each test swap the session without re-mocking the module.
let mockSessionUser: Record<string, unknown> | null;

vi.mock("next-auth/react", () => ({
	useSession: () => ({
		data: mockSessionUser ? { user: mockSessionUser } : null,
	}),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/admin/server", () => ({
	startImpersonation: vi.fn(),
}));

function makeUser(overrides: Partial<User> = {}): User {
	return {
		id: "target-1",
		email: "target@example.com",
		username: null,
		full_name: null,
		avatar_url: null,
		auth_provider: "local",
		is_active: true,
		is_verified: true,
		is_superuser: false,
		role: "member",
		last_login_at: null,
		created_at: "2026-01-01T00:00:00Z",
		updated_at: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

describe("ImpersonateUserButton", () => {
	beforeEach(() => {
		// Default actor: a superuser (the only role allowed to impersonate).
		mockSessionUser = { id: "admin-1", is_superuser: true };
	});

	it("renders for a superuser actor targeting a regular user", () => {
		render(<ImpersonateUserButton user={makeUser()} />);
		expect(
			screen.queryByRole("button", { name: /impersonate user/i }),
		).not.toBeNull();
	});

	it("is hidden when the actor is not a superuser (CHAOS-2303)", () => {
		// Regression: a normal admin must not be offered an action that the
		// backend always rejects with 403.
		mockSessionUser = { id: "admin-1", is_superuser: false };
		const { container } = render(<ImpersonateUserButton user={makeUser()} />);
		expect(container.firstChild).toBeNull();
	});

	it("is hidden when there is no session", () => {
		mockSessionUser = null;
		const { container } = render(<ImpersonateUserButton user={makeUser()} />);
		expect(container.firstChild).toBeNull();
	});

	it("is hidden when targeting a superuser", () => {
		const { container } = render(
			<ImpersonateUserButton user={makeUser({ is_superuser: true })} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("is hidden when targeting an admin", () => {
		const { container } = render(
			<ImpersonateUserButton user={makeUser({ role: "admin" })} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("is hidden when targeting yourself", () => {
		const { container } = render(
			<ImpersonateUserButton user={makeUser({ id: "admin-1" })} />,
		);
		expect(container.firstChild).toBeNull();
	});
});
