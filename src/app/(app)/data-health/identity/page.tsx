import { IdentityGapsTable } from "../_components/IdentityGapsTable";

export default function DataHealthIdentityPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Identity Health</h1>
        <p className="mt-2 text-(--ink-muted)">
          Review unmapped identities from connectors and manually confirm suggested aliases.
        </p>
      </div>

      <IdentityGapsTable />
    </div>
  );
}
