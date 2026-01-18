export type ApiQueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export type ApiFetchInit = RequestInit & {
  next?: {
    revalidate?: number;
  };
};

// Server-side: fetch directly from backend (BACKEND_URL read at runtime, not build time)
// Client-side: use relative paths, proxied through Next.js rewrites
const resolveOrigin = () => {
  if (typeof window !== "undefined") {
    // Browser: use relative paths, Next.js rewrites proxy to backend
    return window.location.origin;
  }
  // Server-side SSR: must use absolute URL to reach backend directly
  // process.env is read at runtime, not baked in at build time
  return process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
};

const buildUrl = (path: string, params?: ApiQueryParams) => {
  const url = new URL(path, resolveOrigin());
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === "" || value === undefined || value === null) {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
};

const request = (path: string, init?: ApiFetchInit, params?: ApiQueryParams) =>
  fetch(buildUrl(path, params), init);

const fetchJson = async <T>(
  path: string,
  init?: ApiFetchInit,
  params?: ApiQueryParams
): Promise<T> => {
  const response = await request(path, init, params);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  // Use text() and trim() to handle keep-alive pings (leading/trailing whitespace)
  const text = await response.text();
  return JSON.parse(text.trim()) as T;
};

const getJson = async <T>(
  path: string,
  params?: ApiQueryParams,
  init?: ApiFetchInit
): Promise<T> => fetchJson<T>(path, init, params);

const postJson = async <T>(
  path: string,
  body: unknown,
  init?: ApiFetchInit,
  params?: ApiQueryParams
): Promise<T> => {
  const headers = {
    "Content-Type": "application/json",
    ...(init?.headers ?? {}),
  };
  return fetchJson<T>(
    path,
    {
      ...init,
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    params
  );
};

const sendBeacon = (
  path: string,
  body: string | Blob,
  contentType = "application/json"
) => {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) {
    return false;
  }
  const payload =
    body instanceof Blob ? body : new Blob([body], { type: contentType });
  return navigator.sendBeacon(buildUrl(path), payload);
};

export const apiClient = {
  buildUrl,
  request,
  fetchJson,
  getJson,
  postJson,
  sendBeacon,
};
