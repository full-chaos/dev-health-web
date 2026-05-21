import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TeamPicker } from "./TeamPicker";

test("renders picker with team buttons", () => {
  const teams = [
    { value: "Alpha", count: 10 },
    { value: "Bravo", count: 5 },
  ];

  render(<TeamPicker teams={teams} weekStart="2026-05-18" />);

  expect(screen.getByRole("heading", { name: "Select a team" })).toBeInTheDocument();
  
  const linkAlpha = screen.getByRole("link", { name: /Alpha/ });
  expect(linkAlpha).toHaveAttribute("href", "/operating-review?team=Alpha&week=2026-05-18");

  const linkBravo = screen.getByRole("link", { name: /Bravo/ });
  expect(linkBravo).toHaveAttribute("href", "/operating-review?team=Bravo&week=2026-05-18");
});

test("renders no teams state", () => {
  render(<TeamPicker teams={[]} weekStart="2026-05-18" />);

  expect(screen.getByText(/No teams synced yet/)).toBeInTheDocument();
  const link = screen.getByRole("link", { name: "Check data connections" });
  expect(link).toHaveAttribute("href", "/data-health");
});

test("preserves encoded filter when present", () => {
  const teams = [{ value: "Charlie", count: 1 }];
  render(<TeamPicker teams={teams} weekStart="2026-05-18" encodedFilter="enc123" />);

  const link = screen.getByRole("link", { name: /Charlie/ });
  expect(link).toHaveAttribute("href", "/operating-review?team=Charlie&week=2026-05-18&f=enc123");
});
