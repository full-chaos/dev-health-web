import React from "react";

export type ConnectionStatusType = "connected" | "error" | "not_configured" | "connecting";

type ConnectionStatusProps = {
  status: ConnectionStatusType;
  className?: string;
};

export function ConnectionStatus({ status, className = "" }: ConnectionStatusProps) {
  const styles = {
    connected: "bg-green-100 text-green-700 border-green-200",
    error: "bg-red-100 text-red-700 border-red-200",
    not_configured: "bg-gray-100 text-gray-600 border-gray-200",
    connecting: "bg-blue-100 text-blue-700 border-blue-200",
  };

  const labels = {
    connected: "Connected",
    error: "Connection Error",
    not_configured: "Not Configured",
    connecting: "Connecting...",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]} ${className}`}
    >
      {status === "connected" && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500" />
      )}
      {status === "error" && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
      )}
      {status === "not_configured" && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-gray-400" />
      )}
      {status === "connecting" && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
      )}
      {labels[status]}
    </span>
  );
}
