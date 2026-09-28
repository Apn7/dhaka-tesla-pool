import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, isUniqueViolation } from "../../db/index.js";
import { rideEvents, rideRequests, rides, users, vehicles } from "../../db/schema.js";
import { calculateFare } from "../../domain/fare.js";
import { REQUEST_TRANSITIONS, allowedFrom, type RequestStatus } from "../../domain/lifecycle.js";
import { HttpError } from "../../lib/http-error.js";
import { getMap } from "../areas/areas.service.js";

// Same list as the ride_requests_one_active_per_passenger index
const ACTIVE: RequestStatus[] = ["REQUESTED", "MATCHED", "DRIVER_ARRIVED", "STARTED"];

// Shortest road distance and fare for a trip
export async function quote(pickupAreaId: string, dropoffAreaId: string, seats: number) {
  const { areas, distance } = await getMap();
  const onMap = (id: string) => areas.some((a) => a.id === id);
  if (!onMap(pickupAreaId) || !onMap(dropoffAreaId)) throw new HttpError(400, "Unknown area");
  const distanceM = distance(pickupAreaId, dropoffAreaId);
  return { distanceM, fare: calculateFare(distanceM, seats) };
}

// The fare is calculated here and fixed now; nothing the browser sends can change it
export async function book(passengerId: string, pickupAreaId: string, dropoffAreaId: string, seats: number) {
  const { distanceM, fare } = await quote(pickupAreaId, dropoffAreaId, seats);
  try {
    return await db.transaction(async (tx) => {
      const [booked] = await tx
        .insert(rideRequests)
        .values({ passengerId, pickupAreaId, dropoffAreaId, seats, distanceM, farePaisa: fare.farePaisa })
        .returning({ id: rideRequests.id });
      await tx.insert(rideEvents).values({ rideRequestId: booked.id, actorId: passengerId, toStatus: "REQUESTED" });
      return booked;
    });
  } catch (err) {
    // The one-active-request index decides, so a double click can't book twice
    if (isUniqueViolation(err)) throw new HttpError(409, "You already have an active ride");
    throw err;
  }
}

// The passenger's own active request: their fare and status, the ride's status, and only
// how many others share the car (never their names or fares)
export async function current(passengerId: string) {
  const [row] = await db
    .select({
      id: rideRequests.id,
      status: rideRequests.status,
      pickupAreaId: rideRequests.pickupAreaId,
      dropoffAreaId: rideRequests.dropoffAreaId,
      seats: rideRequests.seats,
      distanceM: rideRequests.distanceM,
      farePaisa: rideRequests.farePaisa,
      createdAt: rideRequests.createdAt,
      rideStatus: rides.status,
      vehicleName: vehicles.name,
      driverName: users.name,
      otherPassengers: sql<number>`(
        SELECT count(*)::int FROM ride_requests other
        WHERE other.ride_id = ${rideRequests.rideId}
          AND other.id <> ${rideRequests.id}
          AND other.status <> 'CANCELLED')`,
    })
    .from(rideRequests)
    .leftJoin(rides, eq(rides.id, rideRequests.rideId))
    .leftJoin(vehicles, eq(vehicles.id, rides.vehicleId))
    .leftJoin(users, eq(users.id, vehicles.driverId))
    .where(and(eq(rideRequests.passengerId, passengerId), inArray(rideRequests.status, ACTIVE)));
  return row ?? null;
}

const CANCELLABLE = allowedFrom(REQUEST_TRANSITIONS, "CANCELLED");

// Cancel before the ride starts: frees the seats, and cancels the ride if nobody is left
export function cancel(passengerId: string, requestId: string) {
  return db.transaction(async (tx) => {
    // Owner in WHERE: someone else's request looks like it doesn't exist
    const mine = and(eq(rideRequests.id, requestId), eq(rideRequests.passengerId, passengerId));
    const [seen] = await tx.select({ rideId: rideRequests.rideId }).from(rideRequests).where(mine);
    if (!seen) throw new HttpError(404, "Ride request not found");

    // Lock order: the ride row first, then its requests. Driver actions use the same order,
    // so a cancel and a start at the same moment wait in line instead of deadlocking.
    const [ride] = seen.rideId
      ? await tx.select({ status: rides.status }).from(rides).where(eq(rides.id, seen.rideId)).for("update")
      : [];
    const [request] = await tx
      .select({ status: rideRequests.status, rideId: rideRequests.rideId, seats: rideRequests.seats })
      .from(rideRequests)
      .where(mine)
      .for("update");

    // A driver accepted it between our two reads, so its ride is not locked: start over
    if (request.rideId !== seen.rideId) throw new HttpError(409, "Your ride just changed, please try again");
    if (!CANCELLABLE.includes(request.status)) throw new HttpError(409, "This ride can no longer be cancelled");

    await tx.update(rideRequests).set({ status: "CANCELLED" }).where(eq(rideRequests.id, requestId));
    await tx.insert(rideEvents).values({
      rideId: request.rideId,
      rideRequestId: requestId,
      actorId: passengerId,
      fromStatus: request.status,
      toStatus: "CANCELLED",
    });

    if (request.rideId) {
      await tx
        .update(rides)
        .set({ seatsTaken: sql`${rides.seatsTaken} - ${request.seats}` })
        .where(eq(rides.id, request.rideId));

      const [left] = await tx
        .select({ n: count() })
        .from(rideRequests)
        .where(and(eq(rideRequests.rideId, request.rideId), ne(rideRequests.status, "CANCELLED")));
      if (left.n === 0) {
        await tx.update(rides).set({ status: "CANCELLED" }).where(eq(rides.id, request.rideId));
        await tx.insert(rideEvents).values({
          rideId: request.rideId,
          actorId: passengerId,
          fromStatus: ride.status,
          toStatus: "CANCELLED",
        });
      }
    }
    return { id: requestId, status: "CANCELLED" as const };
  });
}

// Finished trips (completed or cancelled), newest first.
// ponytail: last 50, no paging; add a cursor when someone has more history than that.
export function history(passengerId: string) {
  return db
    .select({
      id: rideRequests.id,
      status: rideRequests.status,
      pickupAreaId: rideRequests.pickupAreaId,
      dropoffAreaId: rideRequests.dropoffAreaId,
      seats: rideRequests.seats,
      farePaisa: rideRequests.farePaisa,
      createdAt: rideRequests.createdAt,
    })
    .from(rideRequests)
    .where(and(eq(rideRequests.passengerId, passengerId), inArray(rideRequests.status, ["COMPLETED", "CANCELLED"])))
    .orderBy(desc(rideRequests.createdAt))
    .limit(50);
}
