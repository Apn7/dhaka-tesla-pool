import { calculateFare } from "../../domain/fare.js";
import { getMap } from "../areas/areas.service.js";

// Shortest road distance and fare for a trip, or null if an area id is not on the map
export async function quote(pickupAreaId: string, dropoffAreaId: string, seats: number) {
  const { areas, distance } = await getMap();
  const onMap = (id: string) => areas.some((a) => a.id === id);
  if (!onMap(pickupAreaId) || !onMap(dropoffAreaId)) return null;
  const distanceM = distance(pickupAreaId, dropoffAreaId);
  return { distanceM, fare: calculateFare(distanceM, seats) };
}
