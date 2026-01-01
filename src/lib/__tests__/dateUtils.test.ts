import { describe, expect, test } from "vitest";
import {
  addDays,
  diffDaysInclusive,
  formatDateInput,
  parseDateInput,
  toLocalDate,
} from "../dateUtils";

describe("dateUtils", () => {
  describe("toLocalDate", () => {
    test("converts Date to local date at midnight", () => {
      const date = new Date(2024, 0, 15, 14, 30, 45);
      const result = toLocalDate(date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });
  });

  describe("formatDateInput", () => {
    test("formats date as YYYY-MM-DD", () => {
      const date = new Date(2024, 0, 15);
      expect(formatDateInput(date)).toBe("2024-01-15");
    });

    test("pads single-digit month and day with zeros", () => {
      const date = new Date(2024, 0, 5);
      expect(formatDateInput(date)).toBe("2024-01-05");
    });
  });

  describe("parseDateInput", () => {
    test("parses valid date string", () => {
      const result = parseDateInput("2024-01-15");
      expect(result).not.toBeNull();
      expect(result?.getFullYear()).toBe(2024);
      expect(result?.getMonth()).toBe(0);
      expect(result?.getDate()).toBe(15);
    });

    test("returns null for invalid date format", () => {
      expect(parseDateInput("2024/01/15")).toBeNull();
      expect(parseDateInput("not-a-date")).toBeNull();
      expect(parseDateInput("2024-01")).toBeNull(); // Missing day
      expect(parseDateInput("01-15")).toBeNull(); // Missing year
      expect(parseDateInput("2024--15")).toBeNull(); // Empty month
      expect(parseDateInput("2024-01-")).toBeNull(); // Empty day
      expect(parseDateInput("-01-15")).toBeNull(); // Empty year
    });

    test("rejects invalid dates like February 30th", () => {
      expect(parseDateInput("2024-02-30")).toBeNull();
    });

    test("rejects invalid month", () => {
      expect(parseDateInput("2024-13-01")).toBeNull();
    });

    test("accepts leap year date", () => {
      const result = parseDateInput("2024-02-29");
      expect(result).not.toBeNull();
      expect(result?.getMonth()).toBe(1);
      expect(result?.getDate()).toBe(29);
    });

    test("rejects non-leap year February 29th", () => {
      expect(parseDateInput("2023-02-29")).toBeNull();
    });
  });

  describe("addDays", () => {
    test("adds positive days", () => {
      const date = new Date(2024, 0, 15);
      const result = addDays(date, 5);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(20);
    });

    test("adds negative days", () => {
      const date = new Date(2024, 0, 15);
      const result = addDays(date, -5);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(10);
    });
  });

  describe("diffDaysInclusive", () => {
    test("calculates inclusive days between dates", () => {
      const start = new Date(2024, 0, 10);
      const end = new Date(2024, 0, 15);
      expect(diffDaysInclusive(start, end)).toBe(6); // 10, 11, 12, 13, 14, 15
    });

    test("returns 1 for same date", () => {
      const date = new Date(2024, 0, 15);
      expect(diffDaysInclusive(date, date)).toBe(1);
    });

    test("handles reversed dates", () => {
      const start = new Date(2024, 0, 15);
      const end = new Date(2024, 0, 10);
      expect(diffDaysInclusive(start, end)).toBe(1); // Returns at least 1
    });
  });
});
