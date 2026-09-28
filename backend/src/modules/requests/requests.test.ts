import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "../../app.js";
import { eq } from "drizzle-orm";
import { db, pool } from "../../db/index.js";
import { rideEvents } from "../../db/schema.js";

afterAll(() => pool.end());

async function loginAs(name: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email: `${name}@teslapool.test`, password: "bullet123" });
  return agent;
}

// A new passenger per test: each passenger may have only one active request, and test files
// share the database, so tests that book must not use the seeded cast
async function newPassenger(name: string) {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/signup")
    .send({ name, email: `${name.toLowerCase()}.${crypto.randomUUID()}@teslapool.test`, password: "secret123" });
  return agent;
}

// Area name → id, read through the API like the frontend does
let area: Record<string, string>;
beforeAll(async () => {
  const res = await (await loginAs("nusrat")).get("/api/areas");
  area = Object.fromEntries(res.body.areas.map((a: { id: string; name: string }) => [a.name, a.id]));
});

const quote = (pickup: string, dropoff: string, seats = 1) =>
  `/api/requests/quote?pickupAreaId=${area[pickup]}&dropoffAreaId=${area[dropoff]}&seats=${seats}`;

describe("fare quote on the real Dhaka map", () => {
  test("Nusrat, Banani → Mohakhali: 2.8 km, 30 + 33.60 − 12.72 = 50.88 Tk", async () => {
    const res = await (await loginAs("nusrat")).get(quote("Banani", "Mohakhali"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      distanceM: 2800,
      fare: { baseFarePaisa: 3000, distanceChargePaisa: 3360, poolDiscountPaisa: 1272, farePaisa: 5088 },
    });
  });

  test("Rafiq, Banani → Gulshan 1: 2.9 km, 51.84 Tk", async () => {
    const res = await (await loginAs("rafiq")).get(quote("Banani", "Gulshan 1"));
    expect(res.body.fare.farePaisa).toBe(5184);
  });

  test("same pickup and drop-off is rejected", async () => {
    const res = await (await loginAs("nusrat")).get(quote("Banani", "Banani"));
    expect(res.status).toBe(400);
  });

  test("an id that is not on the map is rejected", async () => {
    const res = await (await loginAs("nusrat")).get(
      `/api/requests/quote?pickupAreaId=${area.Banani}&dropoffAreaId=01a0dce1-0000-7000-8000-000000000000&seats=1`,
    );
    expect(res.status).toBe(400);
  });

  test("Jashim is a driver, so he can't use passenger endpoints", async () => {
    const res = await (await loginAs("jashim")).get(quote("Banani", "Mohakhali"));
    expect(res.status).toBe(403);
  });

  test("not logged in", async () => {
    expect((await request(app).get(quote("Banani", "Mohakhali"))).status).toBe(401);
  });
});

const trip = (pickup: string, dropoff: string, seats = 1) => ({
  pickupAreaId: area[pickup],
  dropoffAreaId: area[dropoff],
  seats,
});

describe("booking a ride", () => {
  test("Shirin books 2 seats; the server sets the fare, whatever the browser sends", async () => {
    const shirin = await newPassenger("Shirin");
    // Banani → Mohakhali → Tejgaon → Motijheel = 9.3 km.
    // Per seat 30 + 111.60 = 141.60 Tk; × 2 seats = 283.20; − 20% = 226.56 Tk
    const booked = await shirin.post("/api/requests").send({ ...trip("Banani", "Motijheel", 2), farePaisa: 1 });
    expect(booked.status).toBe(201);

    const { request: mine } = (await shirin.get("/api/requests/current")).body;
    expect(mine).toMatchObject({ id: booked.body.id, status: "REQUESTED", seats: 2, distanceM: 9300, farePaisa: 22656 });
    expect(mine.rideStatus).toBeNull(); // no driver yet

    // The history row, written in the same transaction
    const events = await db.select().from(rideEvents).where(eq(rideEvents.rideRequestId, booked.body.id));
    expect(events).toMatchObject([{ fromStatus: null, toStatus: "REQUESTED" }]);
  });

  test("one active ride per passenger", async () => {
    const nusrat = await newPassenger("Nusrat");
    expect((await nusrat.post("/api/requests").send(trip("Banani", "Mohakhali"))).status).toBe(201);
    const again = await nusrat.post("/api/requests").send(trip("Banani", "Gulshan 1"));
    expect(again.status).toBe(409);
  });

  test("a double click books once: two requests at the same moment, exactly one wins", async () => {
    const rafiq = await newPassenger("Rafiq");
    const results = await Promise.all([1, 2].map(() => rafiq.post("/api/requests").send(trip("Banani", "Gulshan 1"))));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  test("each passenger sees only their own request", async () => {
    const nusrat = await newPassenger("Nusrat");
    const rafiq = await newPassenger("Rafiq");
    await nusrat.post("/api/requests").send(trip("Banani", "Mohakhali"));
    expect((await rafiq.get("/api/requests/current")).body.request).toBeNull();
  });

  test("an active request is not history yet", async () => {
    const shirin = await newPassenger("Shirin");
    await shirin.post("/api/requests").send(trip("Banani", "Mohakhali"));
    expect((await shirin.get("/api/requests/history")).body.requests).toEqual([]);
  });
});
