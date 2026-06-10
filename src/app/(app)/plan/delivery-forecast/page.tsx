import { redirect } from "next/navigation";

type DeliveryForecastRedirectProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DeliveryForecastRedirect({
    searchParams,
}: DeliveryForecastRedirectProps) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries((await searchParams) ?? {})) {
        if (Array.isArray(value)) {
            for (const item of value) params.append(key, item);
        } else if (value) {
            params.set(key, value);
        }
    }
    const suffix = params.toString();
    redirect(`/plan${suffix ? `?${suffix}` : ""}`);
}
