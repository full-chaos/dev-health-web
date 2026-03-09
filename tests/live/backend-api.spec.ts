import { expect, test } from "@playwright/test";

const liveBackendUrl =
  process.env.PLAYWRIGHT_LIVE_BACKEND_URL ??
  process.env.BACKEND_URL ??
  "http://127.0.0.1:8000";

test("backend health is reachable", async ({ request }) => {
  const response = await request.get(`${liveBackendUrl}/health`);
  expect(response.status()).toBe(200);

  const payload = (await response.json()) as {
    status?: string;
    services?: Record<string, string>;
  };
  expect(payload.status).toBe("ok");
  expect(payload.services).toBeDefined();
});

test("metadata endpoint returns expected shape", async ({ request }) => {
  const response = await request.get(`${liveBackendUrl}/api/v1/meta`);
  expect(response.status()).toBe(200);

  const payload = (await response.json()) as Record<string, unknown>;
  expect(typeof payload.backend).toBe("string");
  expect(typeof payload.version).toBe("string");
  expect("coverage" in payload).toBe(true);
  expect("limits" in payload).toBe(true);
  expect(Array.isArray(payload.supported_endpoints)).toBe(true);
});

test("home endpoint returns expected shape", async ({ request }) => {
  const response = await request.get(`${liveBackendUrl}/api/v1/home`);
  if (response.status() === 401) {
    const payload = (await response.json()) as { detail?: unknown; message?: unknown };
    const detail = payload.detail;
    const hasErrorInfo =
      typeof detail === "string" ||
      typeof payload.message === "string" ||
      (typeof detail === "object" && detail !== null && "message" in detail);
    expect(hasErrorInfo).toBe(true);
    return;
  }

  expect(response.status()).toBe(200);

  const payload = (await response.json()) as Record<string, unknown>;
  expect(payload.freshness).toBeTruthy();
  expect(Array.isArray(payload.deltas)).toBe(true);
  expect(Array.isArray(payload.summary)).toBe(true);
  expect(payload.tiles).toBeTruthy();
  expect(payload.constraint).toBeTruthy();
  expect(Array.isArray(payload.events)).toBe(true);
});
