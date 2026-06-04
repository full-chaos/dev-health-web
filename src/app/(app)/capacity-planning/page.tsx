import { redirect } from "next/navigation";

type CapacityPlanningRedirectProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CapacityPlanningRedirect({
  searchParams,
}: CapacityPlanningRedirectProps) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value) {
      params.set(key, value);
    }
  }
  const suffix = params.toString();
  redirect(`/plan/delivery-forecast${suffix ? `?${suffix}` : ""}`);
}
