import type { Distance } from "./graph.js";

// Most extra road distance a passenger accepts for the pool discount.
// Calibrated on the real map: Nusrat + Rafiq from Banani costs Rafiq 3.1 km (pooled),
// Mohakhali + Uttara costs 5.6 km (not pooled).
export const MAX_DETOUR_M = 3500;

// Best drop-off order for passengers who share one pickup area, or null if they can't pool.
// Detour = distance travelled until your drop-off − your direct distance.
// Every order where each detour ≤ MAX_DETOUR_M is valid; the shortest total route wins.
// ponytail: tries every order (n!); fine for a 3-seat car (at most 6 orders).
export function planDropoffs(pickup: string, dropoffs: string[], distance: Distance): string[] | null {
  let best: string[] | null = null;
  let bestLength = Infinity;
  for (const order of permutations(dropoffs)) {
    const length = routeLength(pickup, order, distance);
    if (length !== null && length < bestLength) {
      best = order;
      bestLength = length;
    }
  }
  return best;
}

// Total route length, or null as soon as one passenger's detour is too long
function routeLength(pickup: string, order: string[], distance: Distance): number | null {
  let travelled = 0;
  let at = pickup;
  for (const stop of order) {
    travelled += distance(at, stop);
    at = stop;
    if (travelled - distance(pickup, stop) > MAX_DETOUR_M) return null;
  }
  return travelled;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}
