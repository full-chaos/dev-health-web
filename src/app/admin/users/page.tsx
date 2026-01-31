import React from "react";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UserTable, User } from "@/components/admin/users/UserTable";

// Mock data
const MOCK_USERS: User[] = [
  {
    id: "1",
    name: "Alice Smith",
    email: "alice@example.com",
    role: "admin",
    status: "active",
    lastLogin: "2023-10-25T10:00:00Z",
  },
  {
    id: "2",
    name: "Bob Jones",
    email: "bob@example.com",
    role: "member",
    status: "active",
    lastLogin: "2023-10-24T14:30:00Z",
  },
  {
    id: "3",
    name: "Charlie Brown",
    email: "charlie@example.com",
    role: "viewer",
    status: "invited",
  },
  {
    id: "4",
    name: "Diana Prince",
    email: "diana@example.com",
    role: "member",
    status: "inactive",
    lastLogin: "2023-09-15T09:00:00Z",
  },
];

export default function UsersPage() {
  return (
    <div>
      <AdminHeader
        title="Users"
        description="Manage organization members and their roles."
      >
        <Link
          href="/admin/users/new"
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
        >
          Invite User
        </Link>
      </AdminHeader>

      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="Search users..."
          className="w-full max-w-sm rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
        />
        {/* Placeholder for filters */}
      </div>

      <UserTable users={MOCK_USERS} />
    </div>
  );
}
