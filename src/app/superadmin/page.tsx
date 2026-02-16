import { AdminHeader } from "@/components/admin/AdminHeader";

export default function SuperadminDashboard() {
  return (
    <div>
      <AdminHeader
        title="Platform Dashboard"
        description="System overview and health metrics."
      />
      <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-8 text-center text-(--ink-muted)">
        Platform stats coming soon — org count, user count, system health.
      </div>
    </div>
  );
}
