import { describe, expect, it } from "vitest"
import { extractErrorMessage } from "@/lib/errorMessages"

describe("extractErrorMessage", () => {
  it("returns fallback for null", () => {
    expect(extractErrorMessage(null)).toBe("Something went wrong")
  })

  it("returns fallback for undefined", () => {
    expect(extractErrorMessage(undefined)).toBe("Something went wrong")
  })

  it("returns custom fallback when provided", () => {
    expect(extractErrorMessage(null, "Registration failed")).toBe("Registration failed")
  })

  it("returns string detail as-is", () => {
    expect(extractErrorMessage("Email already registered")).toBe("Email already registered")
  })

  it("extracts violations array", () => {
    const detail = {
      violations: [
        "Password must be at least 12 characters long",
        "Password must contain at least one uppercase letter",
      ],
    }
    expect(extractErrorMessage(detail)).toBe(
      "Password must be at least 12 characters long. Password must contain at least one uppercase letter",
    )
  })

  it("returns fallback for empty violations array", () => {
    expect(extractErrorMessage({ violations: [] }, "Nope")).toBe("Nope")
  })

  it("extracts message from lockout object", () => {
    const detail = {
      message: "Too many failed login attempts. Account locked for 15 minutes.",
      retry_after_seconds: 900,
    }
    expect(extractErrorMessage(detail)).toBe(
      "Too many failed login attempts. Account locked for 15 minutes.",
    )
  })

  it("extracts messages from Pydantic validation array", () => {
    const detail = [
      { loc: ["body", "email"], msg: "value is not a valid email address", type: "value_error" },
      { loc: ["body", "password"], msg: "field required", type: "value_error.missing" },
    ]
    expect(extractErrorMessage(detail)).toBe(
      "value is not a valid email address. field required",
    )
  })

  it("handles Pydantic array with string items", () => {
    expect(extractErrorMessage(["error one", "error two"])).toBe("error one. error two")
  })

  it("returns fallback for empty Pydantic array", () => {
    expect(extractErrorMessage([], "Nope")).toBe("Nope")
  })

  it("returns fallback for unrecognized object shape", () => {
    expect(extractErrorMessage({ foo: "bar" }, "Unknown")).toBe("Unknown")
  })

  it("returns fallback for number", () => {
    expect(extractErrorMessage(42)).toBe("Something went wrong")
  })

  it("returns fallback for boolean", () => {
    expect(extractErrorMessage(true)).toBe("Something went wrong")
  })

  it("filters non-string violations", () => {
    const detail = { violations: ["Valid error", 123, null, "Another error"] }
    expect(extractErrorMessage(detail)).toBe("Valid error. Another error")
  })
})
