import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { decodeSecurityFilter, defaultSecurityFilter, encodeSecurityFilter } from "@/lib/filters/security";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { SecurityDashboard } from "@/components/security/SecurityDashboard";
import { SecurityAlertQueue } from "@/components/security/SecurityAlertQueue";
import { SecurityFilterBarWrapper } from "@/components/security/SecurityFilterBarWrapper";

type SecurityPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SecurityPage({ searchParams }: SecurityPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;

  const filter = encodedFilter
    ? decodeSecurityFilter(encodedFilter)
    : defaultSecurityFilter();

  // PrimaryNav expects a MetricFilter for the existing url helper.
  const navFilters = defaultMetricFilter;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={navFilters} active="security" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header>
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
              Security
            </p>
            <h1 className="mt-2 font-(--font-display) text-3xl">
              Security Alerts
            </h1>
            <p className="mt-2 text-sm text-(--ink-muted)">
              Org-wide vulnerability posture — Dependabot, code scanning, and more.
            </p>
          </header>

          <SecurityFilterBarWrapper encodedFilter={encodedFilter ?? encodeSecurityFilter(filter)} />
          <SecurityDashboard filter={filter} />
          <SecurityAlertQueue filter={filter} />
        </main>
      </div>
    </div>
  );
}
