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
  if (role !== "admin" && role !== "owner") {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="md:w-[220px] md:shrink-0 p-6">
        <AdminSidebar />
      </div>
      <main className="flex-1 p-6 md:p-12 md:pt-6">
        {children}
      </main>
    </div>
  );
}
