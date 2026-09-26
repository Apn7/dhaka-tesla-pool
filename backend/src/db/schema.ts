import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["PASSENGER", "DRIVER"]);

// The trip (what the driver sees)
export const rideStatus = pgEnum("ride_status", [
  "ACCEPTED",
  "DRIVER_ARRIVED",
  "STARTED",
  "COMPLETED",
  "CANCELLED",
]);

// One passenger's booking
export const requestStatus = pgEnum("request_status", [
  "REQUESTED",
  "MATCHED",
  "DRIVER_ARRIVED",
  "STARTED",
  "COMPLETED",
  "CANCELLED",
]);

// UUID v7 is built into Postgres 18: time-ordered, so indexes stay compact
const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Nusrat@x.com and nusrat@x.com are the same account
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    driverId: uuid("driver_id")
      .notNull()
      .unique()
      .references(() => users.id),
    name: text("name").notNull(),
    capacity: smallint("capacity").notNull(),
    isOnline: boolean("is_online").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [check("vehicles_capacity_range", sql`${t.capacity} BETWEEN 1 AND 6`)],
);

export const areas = pgTable("areas", {
  id: id(),
  name: text("name").notNull().unique(),
});

// Undirected road between neighbouring areas, stored once (area_a < area_b)
export const roads = pgTable(
  "roads",
  {
    id: id(),
    areaAId: uuid("area_a_id")
      .notNull()
      .references(() => areas.id),
    areaBId: uuid("area_b_id")
      .notNull()
      .references(() => areas.id),
    distanceM: integer("distance_m").notNull(),
  },
  (t) => [
    unique("roads_area_pair_unique").on(t.areaAId, t.areaBId),
    check("roads_area_order", sql`${t.areaAId} < ${t.areaBId}`),
    check("roads_distance_positive", sql`${t.distanceM} > 0`),
  ],
);

// One trip of one vehicle = one pool
export const rides = pgTable(
  "rides",
  {
    id: id(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    pickupAreaId: uuid("pickup_area_id")
      .notNull()
      .references(() => areas.id),
    status: rideStatus("status").notNull().default("ACCEPTED"),
    // Copied from the vehicle: a CHECK can only see its own row
    capacity: smallint("capacity").notNull(),
    seatsTaken: smallint("seats_taken").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("rides_seats_within_capacity", sql`${t.seatsTaken} BETWEEN 0 AND ${t.capacity}`),
    uniqueIndex("rides_one_active_per_vehicle")
      .on(t.vehicleId)
      .where(sql`${t.status} IN ('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED')`),
    index("rides_vehicle_history_idx").on(t.vehicleId, t.createdAt),
  ],
);

export const rideRequests = pgTable(
  "ride_requests",
  {
    id: id(),
    passengerId: uuid("passenger_id")
      .notNull()
      .references(() => users.id),
    pickupAreaId: uuid("pickup_area_id")
      .notNull()
      .references(() => areas.id),
    dropoffAreaId: uuid("dropoff_area_id")
      .notNull()
      .references(() => areas.id),
    seats: smallint("seats").notNull(),
    distanceM: integer("distance_m").notNull(),
    farePaisa: integer("fare_paisa").notNull(),
    status: requestStatus("status").notNull().default("REQUESTED"),
    rideId: uuid("ride_id").references(() => rides.id),
    dropOrder: smallint("drop_order"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ride_requests_different_areas", sql`${t.pickupAreaId} <> ${t.dropoffAreaId}`),
    check("ride_requests_seats_range", sql`${t.seats} BETWEEN 1 AND 3`),
    check("ride_requests_distance_positive", sql`${t.distanceM} > 0`),
    check("ride_requests_fare_positive", sql`${t.farePaisa} > 0`),
    check("ride_requests_drop_order_positive", sql`${t.dropOrder} >= 1`),
    // Waiting requests have no ride; matched, arrived, started and completed ones must have one
    check(
      "ride_requests_matched_has_ride",
      sql`${t.status} = 'CANCELLED' OR (${t.status} = 'REQUESTED') = (${t.rideId} IS NULL)`,
    ),
    uniqueIndex("ride_requests_one_active_per_passenger")
      .on(t.passengerId)
      .where(sql`${t.status} IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED')`),
    index("ride_requests_open_by_pickup_idx").on(t.status, t.pickupAreaId),
    index("ride_requests_ride_idx").on(t.rideId),
    index("ride_requests_passenger_history_idx").on(t.passengerId, t.createdAt),
  ],
);

// Append-only history: one row per status change, written in the same transaction
export const rideEvents = pgTable(
  "ride_events",
  {
    id: id(),
    rideId: uuid("ride_id").references(() => rides.id),
    rideRequestId: uuid("ride_request_id").references(() => rideRequests.id),
    actorId: uuid("actor_id").references(() => users.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("ride_events_has_subject", sql`${t.rideId} IS NOT NULL OR ${t.rideRequestId} IS NOT NULL`),
    index("ride_events_ride_idx").on(t.rideId),
    index("ride_events_request_idx").on(t.rideRequestId),
  ],
);
