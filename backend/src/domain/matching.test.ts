import { describe, expect, test } from "vitest";
import { buildDistances } from "./graph.js";
import { planDropoffs } from "./matching.js";

describe("planDropoffs", () => {
  test("picks the shortest order when every order is within the limit", () => {
    // Pickup --1 km-- Near --1 km-- Far. Far first is valid too (Near detour 2 km) but longer
    const distance = buildDistances(
      ["Pickup", "Near", "Far"],
      [
        { areaAId: "Pickup", areaBId: "Near", distanceM: 1000 },
        { areaAId: "Near", areaBId: "Far", distanceM: 1000 },
      ],
    );
    expect(planDropoffs("Pickup", ["Far", "Near"], distance)).toEqual(["Near", "Far"]);
  });

  // East <--side-- Pickup --side--> West: whoever goes second rides back through
  // the pickup, so their detour is exactly 2 × side
  const oppositeWays = (sideM: number) =>
    buildDistances(
      ["Pickup", "East", "West"],
      [
        { areaAId: "Pickup", areaBId: "East", distanceM: sideM },
        { areaAId: "Pickup", areaBId: "West", distanceM: sideM },
      ],
    );

  test("allows a detour of exactly 3.5 km", () => {
    expect(planDropoffs("Pickup", ["East", "West"], oppositeWays(1750))).not.toBeNull();
  });

  test("refuses to pool when someone's detour is over 3.5 km", () => {
    expect(planDropoffs("Pickup", ["East", "West"], oppositeWays(1751))).toBeNull();
  });
});
