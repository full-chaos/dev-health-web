"use client";

import { useState } from "react";
import { toast } from "sonner";
import { setUserPassword } from "@/lib/admin/server";

type UserSetPasswordFormProps = {
  userId: string;
};

export function UserSetPasswordForm({ userId }: UserSetPasswordFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirm_password") as string;

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    setIsLoading(true);
    const result = await setUserPassword(userId, password);
    setIsLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Password updated successfully");
      (document.getElementById("password-form") as HTMLFormElement)?.reset();
    }
  }

  return (
    <form id="password-form" action={handleSubmit} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            New Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="confirm_password" className="text-sm font-medium">
            Confirm Password
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
        >
          {isLoading ? "Setting Password..." : "Set Password"}
        </button>
      </div>
    </form>
  );
}
