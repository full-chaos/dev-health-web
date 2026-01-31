"use client";

import React, { useState } from "react";
import { ConnectionStatus, ConnectionStatusType } from "./ConnectionStatus";

type IntegrationFormProps = {
  providerName: string;
  initialStatus: ConnectionStatusType;
  onSave: (data: any) => Promise<void>;
  onTestConnection: (data: any) => Promise<boolean>;
  children: React.ReactNode;
};

export function IntegrationForm({
  providerName,
  initialStatus,
  onSave,
  onTestConnection,
  children,
}: IntegrationFormProps) {
  const [status, setStatus] = useState<ConnectionStatusType>(initialStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());

    try {
      await onSave(data);
      setMessage({ type: "success", text: "Settings saved successfully." });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save settings." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsTesting(true);
    setStatus("connecting");
    setMessage(null);

    // In a real app, we would grab the form data here too
    // For now, we assume the parent handles data gathering or we pass current form state
    const form = (e.target as HTMLElement).closest("form");
    const formData = new FormData(form!);
    const data = Object.fromEntries(formData.entries());

    try {
      const success = await onTestConnection(data);
      setStatus(success ? "connected" : "error");
      if (success) {
        setMessage({ type: "success", text: "Connection successful!" });
      } else {
        setMessage({ type: "error", text: "Connection failed. Please check your credentials." });
      }
    } catch (error) {
      setStatus("error");
      setMessage({ type: "error", text: "An error occurred while testing the connection." });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-2xl rounded-lg border border-(--border-subtle) bg-(--surface-base) p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-(--ink-base)">Configuration</h2>
        <ConnectionStatus status={status} />
      </div>

      {message && (
        <div
          className={`mb-6 rounded-md p-4 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {children}

        <div className="flex items-center justify-end gap-4 pt-4 border-t border-(--border-subtle)">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || isSaving}
            className="rounded-md border border-(--border-base) bg-transparent px-4 py-2 text-sm font-medium text-(--ink-base) hover:bg-(--surface-muted) focus:outline-none focus:ring-2 focus:ring-(--surface-inverted) focus:ring-offset-2 disabled:opacity-50"
          >
            {isTesting ? "Testing..." : "Test Connection"}
          </button>
          <button
            type="submit"
            disabled={isSaving || isTesting}
            className="rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90 focus:outline-none focus:ring-2 focus:ring-(--surface-inverted) focus:ring-offset-2 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
