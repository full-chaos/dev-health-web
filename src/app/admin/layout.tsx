import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/admin");
  }

  const role = session.user.role;
  const isSuperuser = session.user.is_superuser === true;
  if (!isSuperuser && role !== "admin" && role !== "owner") {
    redirect("/");
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-20 pt-10 md:flex-row">
        <AdminSidebar isSuperuser={isSuperuser} />
        <main className="flex min-w-0 flex-1 flex-col gap-10">
          {children}
        </main>
      </div>
    </div>
  );
}
