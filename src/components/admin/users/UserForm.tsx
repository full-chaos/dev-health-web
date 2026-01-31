"use client";

import React, { useState } from "react";

export type UserFormData = {
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive" | "invited";
};

type UserFormProps = {
  initialData?: UserFormData;
  onSubmit: (data: UserFormData) => void;
  onCancel: () => void;
  isEdit?: boolean;
};

export function UserForm({ initialData, onSubmit, onCancel, isEdit = false }: UserFormProps) {
  const [formData, setFormData] = useState<UserFormData>(
    initialData || {
      name: "",
      email: "",
      role: "member",
      status: "invited",
    }
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium text-(--ink-muted)">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
            placeholder="John Doe"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-(--ink-muted)">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            disabled={isEdit} // Email usually immutable
            className={`w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent) ${
              isEdit ? "cursor-not-allowed opacity-50" : ""
            }`}
            placeholder="john@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="role" className="text-sm font-medium text-(--ink-muted)">
            Role
          </label>
          <select
            id="role"
            name="role"
            value={formData.role}
            onChange={handleChange}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
          >
            <option value="viewer">Viewer</option>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {isEdit && (
          <div className="space-y-2">
            <label htmlFor="status" className="text-sm font-medium text-(--ink-muted)">
              Status
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="invited">Invited</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70) hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
        >
          {isEdit ? "Save Changes" : "Invite User"}
        </button>
      </div>
    </form>
  );
}
