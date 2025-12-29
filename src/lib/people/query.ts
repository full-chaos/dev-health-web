export const DEFAULT_RANGE_DAYS = 14;
export const DEFAULT_COMPARE_DAYS = 14;

const toNumber = (
  value: string | string[] | undefined,
  fallback: number
) => {
  if (!value) {
    return fallback;
  }
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

export const getRangeParams = (
  params: Record<string, string | string[] | undefined>
) => {
  return {
    range_days: toNumber(params.range_days, DEFAULT_RANGE_DAYS),
    compare_days: toNumber(params.compare_days, DEFAULT_COMPARE_DAYS),
  };
};

export const withRangeParams = (
  path: string,
  rangeDays: number,
  compareDays: number,
  extras?: Record<string, string | number | undefined>
) => {
  const params = new URLSearchParams();
  params.set("range_days", String(rangeDays));
  params.set("compare_days", String(compareDays));
  if (extras) {
    Object.entries(extras).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      params.set(key, String(value));
    });
  }
  if (path.includes("?")) {
    return `${path}&${params.toString()}`;
  }
  return `${path}?${params.toString()}`;
};
