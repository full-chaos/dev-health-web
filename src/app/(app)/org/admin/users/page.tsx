import Link from "next/link";
import { Plus } from "lucide-react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { UserTable } from "@/components/admin/users/UserTable";
import { buttonClassName } from "@/components/shared/Button";
import { Notice } from "@/components/ui/Notice";
import { RetryButton } from "@/components/ui/RetryButton";
import { listUsers } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { logger } from "@/lib/logger";

// The h1 is the destination ("Organization"); the tab row names the view (design A2).
const DESCRIPTION = "Manage organization members.";

export default async function UsersPage() {
    const result = await listUsers();

    if (result.error) {
        // The backend text goes to the server log, never to the page (one plain sentence + Retry).
        logger.error({ err: result.error }, "Failed to load users");
    }

    return (
        <div className="space-y-6">
            <AdminHeader title="Organization" description={DESCRIPTION}>
                <Link href="/org/admin/users/new" className={buttonClassName("primary", "md")}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    {CTA_LABELS.addUser}
                </Link>
            </AdminHeader>
            {result.error ? (
                <Notice variant="danger" live={false} action={<RetryButton />}>
                    Users could not be loaded. Retry, or check again in a moment.
                </Notice>
            ) : (
                <UserTable users={result.data ?? []} />
            )}
        </div>
    );
}
