import { describe, it, expect } from "vitest";
import { ok, err, withResult, type Result } from "../result";

describe("ok", () => {
  it("returns a successful Result with data", () => {
    const result = ok(42);
    expect(result.data).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it("works with objects", () => {
    const result = ok({ id: "1", name: "test" });
    expect(result.data).toEqual({ id: "1", name: "test" });
  });
});

describe("err", () => {
  it("returns a failed Result with an error message", () => {
    const result = err("something went wrong");
    expect(result.error).toBe("something went wrong");
    expect(result.data).toBeUndefined();
  });
});

describe("withResult", () => {
  it("wraps a successful async function", async () => {
    const result = await withResult(async () => "hello");
    expect(result.data).toBe("hello");
    expect(result.error).toBeUndefined();
  });

  it("catches thrown errors and returns them as error Results", async () => {
    const result = await withResult(async () => {
      throw new Error("network failure");
    });
    expect(result.error).toBe("network failure");
    expect(result.data).toBeUndefined();
  });

  it("catches non-Error throws and returns a fallback message", async () => {
    const result = await withResult(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "raw string error";
    });
    expect(result.error).toBe("An unexpected error occurred");
  });
});

describe("Result type narrowing", () => {
  it("TypeScript narrows data correctly after error check", () => {
    const result: Result<number> = ok(10);
    if (result.error) {
      // Should not reach here in this test
      expect(true).toBe(false);
    } else {
      // TypeScript should know result.data is number here
      expect(result.data).toBe(10);
    }
  });
});
