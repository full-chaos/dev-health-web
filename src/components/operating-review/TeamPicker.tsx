import Link from "next/link";

type TeamPickerProps = {
  teams: { value: string; count: number }[];
  weekStart: string;
  encodedFilter?: string;
};

export function TeamPicker({ teams, weekStart, encodedFilter }: TeamPickerProps) {
  if (teams.length === 0) {
    return (
      <section className="rounded-[1.75rem] border border-dashed border-border bg-card/70 p-8 text-sm text-muted-foreground text-center">
        No teams synced yet.{" "}
        <Link href="/data-health" className="font-medium text-primary hover:underline">
          Check data connections
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-[1.75rem] border border-dashed border-border bg-card/70 p-8">
      <div className="mb-6 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">Select a team</h2>
        <p className="text-sm text-muted-foreground">
          Choose a team to view their operating review for the week of {weekStart}.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {teams.map((team) => {
          const searchParams = new URLSearchParams();
          searchParams.set("team", team.value);
          searchParams.set("week", weekStart);
          if (encodedFilter) {
            searchParams.set("f", encodedFilter);
          }

          return (
            <Link
              key={team.value}
              href={`/operating-review?${searchParams.toString()}`}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition hover:border-primary/50 hover:bg-muted/50"
            >
              {team.value}
            </Link>
          );
        })}
      </div>
    </section>
  );
}