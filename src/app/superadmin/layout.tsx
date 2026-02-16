import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SuperadminSidebar } from "@/components/superadmin/SuperadminSidebar";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/superadmin");
  }
  if (session.user.is_superuser !== true) {
    redirect("/");  // Non-superusers can't access
  }
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-20 pt-10 md:flex-row">
        <SuperadminSidebar />
        <main className="flex min-w-0 flex-1 flex-col gap-10">{children}</main>
      </div>
    </div>
  );
}
