/**
 * Shared vi.mock() factories for common Next.js / app dependencies.
 * Import these in test files as needed.
 */

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

export const mockSearchParams = new URLSearchParams();

export function makeMockSearchParams(params: Record<string, string> = {}) {
  const sp = new URLSearchParams(params);
  return {
    get: (key: string) => sp.get(key),
    toString: () => sp.toString(),
    has: (key: string) => sp.has(key),
  };
}
