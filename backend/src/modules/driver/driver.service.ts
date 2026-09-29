import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { rideEvents, rideRequests, rides, users, vehicles } from "../../db/schema.js";
import {
  OPEN_RIDE_STATUSES,
  RIDE_TRANSITIONS,
  allowedFrom,
  type RequestStatus,
  type RideStatus,
} from "../../domain/lifecycle.js";
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

// The car's active ride (0 or 1 rows). Returns the query, so a transaction can add .for("update").
function activeRide(vehicleId: string, q: Pick<typeof db, "select"> = db) {
  return q
    .select()
    .from(rides)
    .where(and(eq(rides.vehicleId, vehicleId), inArray(rides.status, ACTIVE_RIDE)));
}

// Passengers still on a ride (everyone but those who cancelled). `q` lets a transaction reuse it.
function passengersOf(rideId: string, q: Pick<typeof db, "select"> = db) {
  return q
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
  const [ride] = await activeRide(vehicle.id);
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
  const [ride] = await activeRide(vehicle.id);
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

// Put a waiting request on the driver's ride, creating the ride if there is none.
// Lock order: car, then ride, then request (cancel uses ride, then request), so no deadlocks.
export function accept(driverId: string, requestId: string) {
  return db.transaction(async (tx) => {
    // Locking the car queues up one driver's accepts: a double tap can't create two rides
    const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.driverId, driverId)).for("update");
    if (!vehicle) throw new HttpError(404, "No Tesla is registered to you");
    if (!vehicle.isOnline) throw new HttpError(409, "Go online to accept rides");

    let [ride] = await activeRide(vehicle.id, tx).for("update");

    const [request] = await tx.select().from(rideRequests).where(eq(rideRequests.id, requestId));
    if (!request) throw new HttpError(404, "Ride request not found");
    if (request.status !== "REQUESTED") throw new HttpError(409, "This request is no longer waiting");

    if (ride) {
      // The backend re-checks the match on every accept, whatever the driver's screen showed
      if (!OPEN_RIDE_STATUSES.includes(ride.status)) throw new HttpError(409, "Your ride has already started");
      if (request.pickupAreaId !== ride.pickupAreaId) throw new HttpError(409, "This request starts somewhere else");
      const onBoard = (await passengersOf(ride.id, tx)).map((p) => p.dropoffAreaId);
      const { distance } = await getMap();
      if (planDropoffs(ride.pickupAreaId, [...onBoard, request.dropoffAreaId], distance) === null) {
        throw new HttpError(409, "This trip is too far off your route");
      }
    } else {
      [ride] = await tx
        .insert(rides)
        .values({ vehicleId: vehicle.id, pickupAreaId: request.pickupAreaId, capacity: vehicle.capacity })
        .returning();
      await tx.insert(rideEvents).values({ rideId: ride.id, actorId: driverId, toStatus: "ACCEPTED" });
    }

    // Seat claim in one statement: the condition is checked on the row itself, so seats can
    // never go over capacity (the rides_seats_within_capacity CHECK backs it up)
    const claimed = await tx
      .update(rides)
      .set({ seatsTaken: sql`${rides.seatsTaken} + ${request.seats}` })
      .where(and(eq(rides.id, ride.id), sql`${rides.seatsTaken} + ${request.seats} <= ${rides.capacity}`))
      .returning({ id: rides.id });
    if (claimed.length === 0) throw new HttpError(409, "Not enough free seats");

    // Request claim: only while it is still waiting. Another driver or a cancel that got
    // there first leaves 0 rows, and the whole transaction (seats, new ride) is undone.
    const matched = await tx
      .update(rideRequests)
      .set({ status: "MATCHED", rideId: ride.id })
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.status, "REQUESTED")))
      .returning({ id: rideRequests.id });
    if (matched.length === 0) throw new HttpError(409, "Someone else took this request, or it was cancelled");
    const logRequest = (fromStatus: RequestStatus, toStatus: RequestStatus) =>
      tx.insert(rideEvents).values({ rideId: ride.id, rideRequestId: requestId, actorId: driverId, fromStatus, toStatus });
    await logRequest("REQUESTED", "MATCHED");

    // Joining after the driver arrived: the passenger catches up in the same transaction
    if (ride.status === "DRIVER_ARRIVED") {
      await tx.update(rideRequests).set({ status: "DRIVER_ARRIVED" }).where(eq(rideRequests.id, requestId));
      await logRequest("MATCHED", "DRIVER_ARRIVED");
    }
    return { rideId: ride.id };
  });
}

const STEP = { arrive: "DRIVER_ARRIVED", start: "STARTED", complete: "COMPLETED" } as const;
export type Step = keyof typeof STEP;

// Move the driver's active ride one step. Everyone still on board moves with it.
// Going offline mid-trip is allowed, so there is no online check here.
export function advance(driverId: string, step: Step) {
  const to = STEP[step];
  return db.transaction(async (tx) => {
    const vehicle = await myVehicle(driverId);
    // Ride row first, as in cancel, so Start and a passenger's Cancel queue up instead of deadlocking
    const [ride] = await activeRide(vehicle.id, tx).for("update");
    if (!ride) throw new HttpError(404, "You have no active ride");
    if (!allowedFrom(RIDE_TRANSITIONS, to).includes(ride.status)) {
      throw new HttpError(409, `Can't ${step} now: the ride is ${ride.status}`);
    }

    await tx.update(rides).set({ status: to }).where(eq(rides.id, ride.id));
    await tx.insert(rideEvents).values({ rideId: ride.id, actorId: driverId, fromStatus: ride.status, toStatus: to });

    // A matched request mirrors its ride (MATCHED while the ride is ACCEPTED)
    const passengerFrom = ride.status === "ACCEPTED" ? "MATCHED" : ride.status;
    const moved = await tx
      .update(rideRequests)
      .set({ status: to })
      .where(and(eq(rideRequests.rideId, ride.id), eq(rideRequests.status, passengerFrom)))
      .returning({ id: rideRequests.id });
    if (moved.length > 0) {
      await tx.insert(rideEvents).values(
        moved.map((r) => ({
          rideId: ride.id,
          rideRequestId: r.id,
          actorId: driverId,
          fromStatus: passengerFrom,
          toStatus: to,
        })),
      );
    }
    return { rideId: ride.id, status: to };
  });
}

// Finished rides of the driver's Tesla, newest first, with the cash collected.
// ponytail: last 50, no paging; add a cursor when a driver has more history than that.
export async function history(driverId: string) {
  const vehicle = await myVehicle(driverId);
  const completed = sql`${rideRequests.status} = 'COMPLETED'`;
  return db
    .select({
      id: rides.id,
      status: rides.status,
      pickupAreaId: rides.pickupAreaId,
      createdAt: rides.createdAt,
      passengers: sql<number>`(count(${rideRequests.id}) FILTER (WHERE ${completed}))::int`,
      cashPaisa: sql<number>`(coalesce(sum(${rideRequests.farePaisa}) FILTER (WHERE ${completed}), 0))::int`,
    })
    .from(rides)
    .leftJoin(rideRequests, eq(rideRequests.rideId, rides.id))
    .where(and(eq(rides.vehicleId, vehicle.id), inArray(rides.status, ["COMPLETED", "CANCELLED"])))
    .groupBy(rides.id)
    .orderBy(desc(rides.createdAt))
    .limit(50);
}
