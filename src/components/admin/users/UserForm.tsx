"use client";

import React, { useState } from "react";
import type { UserCreate, User } from "@/lib/admin/types";

export type UserFormData = UserCreate & { is_active?: boolean };

type UserFormProps = {
   initialData?: User;
   onSubmit: (data: UserFormData) => Promise<void>;
   onCancel: () => void;
   isEdit?: boolean;
   isLoading?: boolean;
 };

export function UserForm({
   initialData,
   onSubmit,
   onCancel,
   isEdit = false,
   isLoading = false,
 }: UserFormProps) {
  const [formData, setFormData] = useState<UserFormData>({
    email: initialData?.email || "",
    full_name: initialData?.full_name || "",
    username: initialData?.username || "",
    password: "",
    is_active: initialData?.is_active ?? true,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const newValue = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: newValue }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const inputClass =
    "w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)";

   return (
     <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
       <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-(--ink-muted)">
            Email *
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            disabled={isEdit || isLoading}
            className={`${inputClass} ${isEdit ? "cursor-not-allowed opacity-50" : ""}`}
            placeholder="john@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="full_name" className="text-sm font-medium text-(--ink-muted)">
            Full Name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            value={formData.full_name || ""}
            onChange={handleChange}
            disabled={isLoading}
            className={inputClass}
            placeholder="John Doe"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="username" className="text-sm font-medium text-(--ink-muted)">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            value={formData.username || ""}
            onChange={handleChange}
            disabled={isLoading}
            className={inputClass}
            placeholder="johndoe"
          />
        </div>

        {!isEdit && (
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-(--ink-muted)">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password || ""}
              onChange={handleChange}
              disabled={isLoading}
              className={inputClass}
              placeholder="••••••••"
              minLength={8}
            />
            <p className="text-xs text-(--ink-muted)">
              Leave blank to send invitation email instead
            </p>
          </div>
        )}

        {isEdit && (
          <div className="space-y-2">
            <label htmlFor="is_active" className="text-sm font-medium text-(--ink-muted)">
              Status
            </label>
            <div className="flex items-center gap-2 pt-2">
              <input
                id="is_active"
                name="is_active"
                type="checkbox"
                checked={formData.is_active}
                onChange={handleChange}
                disabled={isLoading}
                className="h-4 w-4 rounded border-(--card-stroke) text-(--accent) focus:ring-(--accent)"
              />
              <label htmlFor="is_active" className="text-sm text-foreground">
                Active
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70) hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
        >
          {isLoading ? "Saving..." : isEdit ? "Save Changes" : "Create User"}
        </button>
      </div>
    </form>
  );
}
