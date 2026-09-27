// All money is integer paisa (100 paisa = 1 Tk): floats can't hold 0.1 exactly.
const BASE_FARE_PAISA = 3000; // 30 Tk
const PER_100M_PAISA = 120; // 12 Tk per km
const POOL_DISCOUNT_PERCENT = 20; // every ride is shareable

export type Fare = {
  baseFarePaisa: number;
  distanceChargePaisa: number;
  poolDiscountPaisa: number;
  farePaisa: number;
};

// fare = baseFare + distanceCharge − poolDiscount (PRD Section 5), per seat × seats.
// Fixed at request time from the shortest road distance.
export function calculateFare(distanceM: number, seats: number): Fare {
  const units100m = Math.round(distanceM / 100); // bill in 0.1 km steps, halves up
  const baseFarePaisa = BASE_FARE_PAISA * seats;
  const distanceChargePaisa = PER_100M_PAISA * units100m * seats;
  // Always whole paisa: 3000 and 120 both divide by 5, so 20% needs no rounding
  const poolDiscountPaisa = ((baseFarePaisa + distanceChargePaisa) * POOL_DISCOUNT_PERCENT) / 100;
  return {
    baseFarePaisa,
    distanceChargePaisa,
    poolDiscountPaisa,
    farePaisa: baseFarePaisa + distanceChargePaisa - poolDiscountPaisa,
  };
}
