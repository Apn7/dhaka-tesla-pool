import { describe, expect, test } from "vitest";
import { buildDistances } from "./graph.js";

describe("buildDistances", () => {
  // A --1 km-- B --1 km-- C, plus a direct A--C road of 5 km
  const distance = buildDistances(
    ["A", "B", "C"],
    [
      { areaAId: "A", areaBId: "B", distanceM: 1000 },
      { areaAId: "B", areaBId: "C", distanceM: 1000 },
      { areaAId: "A", areaBId: "C", distanceM: 5000 },
    ],
  );

  test("takes the shorter way through a middle area, in both directions", () => {
    expect(distance("A", "C")).toBe(2000);
    expect(distance("C", "A")).toBe(2000);
    expect(distance("A", "A")).toBe(0);
  });

  test("rejects an unknown area", () => {
    expect(() => distance("A", "Z")).toThrow("Unknown area: Z");
  });

  test("rejects a map where some area can't be reached", () => {
    expect(() => buildDistances(["A", "B"], [])).toThrow("not connected");
  });
});
