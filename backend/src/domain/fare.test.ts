import { describe, expect, test } from "vitest";
import { calculateFare } from "./fare.js";

describe("calculateFare", () => {
  test("Nusrat, Banani → Mohakhali, 2.8 km, 1 seat: 30 + 33.60 − 12.72 = 50.88 Tk", () => {
    expect(calculateFare(2800, 1)).toEqual({
      baseFarePaisa: 3000,
      distanceChargePaisa: 3360,
      poolDiscountPaisa: 1272,
      farePaisa: 5088,
    });
  });

  test("Rafiq, Banani → Gulshan 1, 2.9 km, 1 seat: 30 + 34.80 − 12.96 = 51.84 Tk", () => {
    expect(calculateFare(2900, 1).farePaisa).toBe(5184);
  });

  test("two seats cost exactly double", () => {
    expect(calculateFare(2800, 2).farePaisa).toBe(2 * 5088);
  });

  test("bills distance in 0.1 km steps, halves up", () => {
    expect(calculateFare(2849, 1).farePaisa).toBe(5088); // 2.8 km
    expect(calculateFare(2850, 1).farePaisa).toBe(5184); // 2.9 km
  });
});
