// Shared by the integration tests. Test files share one database, and a passenger or car
// may have only one active ride, so tests that book or drive use fresh users, not the seeded cast.
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/db/index.js";
import { areas, rideRequests, rides, users, vehicles } from "../src/db/schema.js";
import type { RideStatus } from "../src/domain/lifecycle.js";
import { hashPassword } from "../src/lib/password.js";

export type Agent = ReturnType<typeof request.agent>;

const uniqueEmail = (name: string) => `${name.toLowerCase()}.${crypto.randomUUID()}@teslapool.test`;

// A seeded cast member (password bullet123)
export async function loginAs(name: string): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email: `${name}@teslapool.test`, password: "bullet123" });
  return agent;
}

export async function newPassenger(name: string): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post("/api/auth/signup").send({ name, email: uniqueEmail(name), password: "secret123" });
  return agent;
}

// Drivers can't sign up, so a new one and their 3-seat Tesla go straight into the database
export async function newDriver(name = "Jashim", online = true) {
  const email = uniqueEmail(name);
  const [driver] = await db
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword("secret123"), role: "DRIVER" })
    .returning();
  const [car] = await db.insert(vehicles).values({ driverId: driver.id, name: "Bullet", capacity: 3, isOnline: online }).returning();
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "secret123" });
  return { agent, vehicleId: car.id };
}

let areaIds: Record<string, string> | undefined;
export async function area(name: string) {
  areaIds ??= Object.fromEntries((await db.select().from(areas)).map((a) => [a.name, a.id]));
  return areaIds[name];
}

export async function book(agent: Agent, pickup: string, dropoff: string, seats = 1): Promise<string> {
  const res = await agent
    .post("/api/requests")
    .send({ pickupAreaId: await area(pickup), dropoffAreaId: await area(dropoff), seats });
  return res.body.id;
}

// A ride written straight into the database, with the given requests matched onto it.
// Without a vehicle, a new driver and Tesla are made for it.
export async function rideWith(requestIds: string[], status: RideStatus = "ACCEPTED", vehicleId?: string) {
  vehicleId ??= (await newDriver()).vehicleId;
  const booked = await db.select().from(rideRequests).where(inArray(rideRequests.id, requestIds));
  const [ride] = await db
    .insert(rides)
    .values({
      vehicleId,
      pickupAreaId: booked[0].pickupAreaId,
      status,
      capacity: 3,
      seatsTaken: booked.reduce((sum, r) => sum + r.seats, 0),
    })
    .returning();
  await db
    .update(rideRequests)
    .set({ status: status === "ACCEPTED" ? "MATCHED" : status, rideId: ride.id })
    .where(inArray(rideRequests.id, requestIds));
  return ride.id;
}

export const rideRow = async (id: string) => (await db.select().from(rides).where(eq(rides.id, id)))[0];
