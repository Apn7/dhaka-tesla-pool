import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../db/index.js";
import { rideRequests, rides, users, vehicles } from "../../db/schema.js";
import { OPEN_RIDE_STATUSES, type RideStatus } from "../../domain/lifecycle.js";
import { planDropoffs } from "../../domain/matching.js";
import { HttpError } from "../../lib/http-error.js";
import { getMap } from "../areas/areas.service.js";

// Same list as the rides_one_active_per_vehicle index
const ACTIVE_RIDE: RideStatus[] = ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"];

async function myVehicle(driverId: string) {
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.driverId, driverId));
  if (!vehicle) throw new HttpError(404, "No Tesla is registered to you");
  return vehicle;
}

async function activeRide(vehicleId: string) {
  const [ride] = await db
    .select()
    .from(rides)
    .where(and(eq(rides.vehicleId, vehicleId), inArray(rides.status, ACTIVE_RIDE)));
  return ride ?? null;
}

// Passengers still on a ride (everyone but those who cancelled)
function passengersOf(rideId: string) {
  return db
    .select({
      requestId: rideRequests.id,
      name: users.name,
      dropoffAreaId: rideRequests.dropoffAreaId,
      seats: rideRequests.seats,
      farePaisa: rideRequests.farePaisa,
      status: rideRequests.status,
    })
    .from(rideRequests)
    .innerJoin(users, eq(users.id, rideRequests.passengerId))
    .where(and(eq(rideRequests.rideId, rideId), ne(rideRequests.status, "CANCELLED")));
}

// The driver's Tesla and active ride, with passengers in drop-off order
export async function me(driverId: string) {
  const vehicle = await myVehicle(driverId);
  const ride = await activeRide(vehicle.id);
  if (!ride) return { vehicle, ride: null };

  const passengers = await passengersOf(ride.id);
  const { distance } = await getMap();
  const order = planDropoffs(ride.pickupAreaId, passengers.map((p) => p.dropoffAreaId), distance) ?? [];
  passengers.sort((a, b) => order.indexOf(a.dropoffAreaId) - order.indexOf(b.dropoffAreaId));
  return { vehicle, ride: { ...ride, passengers } };
}

export async function setOnline(driverId: string, online: boolean) {
  const [vehicle] = await db
    .update(vehicles)
    .set({ isOnline: online })
    .where(eq(vehicles.driverId, driverId))
    .returning();
  if (!vehicle) throw new HttpError(404, "No Tesla is registered to you");
  return vehicle;
}

// Waiting requests this driver can take now. With no ride: any that fit the car.
// With an open ride: same pickup, enough free seats, and every detour within the limit.
// Offline, or once the ride has started: none.
export async function openRequests(driverId: string) {
  const vehicle = await myVehicle(driverId);
  if (!vehicle.isOnline) return [];
  const ride = await activeRide(vehicle.id);
  if (ride && !OPEN_RIDE_STATUSES.includes(ride.status)) return [];

  // ponytail: oldest 50 waiting requests; with many drivers, filter by the driver's area first
  const waiting = await db
    .select({
      id: rideRequests.id,
      passengerName: users.name,
      pickupAreaId: rideRequests.pickupAreaId,
      dropoffAreaId: rideRequests.dropoffAreaId,
      seats: rideRequests.seats,
      farePaisa: rideRequests.farePaisa,
      createdAt: rideRequests.createdAt,
    })
    .from(rideRequests)
    .innerJoin(users, eq(users.id, rideRequests.passengerId))
    .where(
      and(
        eq(rideRequests.status, "REQUESTED"),
        ride ? eq(rideRequests.pickupAreaId, ride.pickupAreaId) : undefined,
      ),
    )
    .orderBy(asc(rideRequests.createdAt))
    .limit(50);

  if (!ride) return waiting.filter((r) => r.seats <= vehicle.capacity);

  const onBoard = (await passengersOf(ride.id)).map((p) => p.dropoffAreaId);
  const freeSeats = ride.capacity - ride.seatsTaken;
  const { distance } = await getMap();
  return waiting.filter(
    (r) => r.seats <= freeSeats && planDropoffs(ride.pickupAreaId, [...onBoard, r.dropoffAreaId], distance) !== null,
  );
}
