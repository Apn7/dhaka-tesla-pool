import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "../../app.js";
import { eq } from "drizzle-orm";
import { book, loginAs, newPassenger, rideRow, rideWith } from "../../../test/helpers.js";
import { db, pool } from "../../db/index.js";
import { rideEvents } from "../../db/schema.js";

afterAll(() => pool.end());

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

describe("cancelling", () => {
  test("Nusrat cancels while waiting: it moves to her history, with an event", async () => {
    const nusrat = await newPassenger("Nusrat");
    const id = await book(nusrat, "Banani", "Mohakhali");

    const res = await nusrat.post(`/api/requests/${id}/cancel`);
    expect(res.status).toBe(200);
    expect((await nusrat.get("/api/requests/current")).body.request).toBeNull();
    expect((await nusrat.get("/api/requests/history")).body.requests).toMatchObject([{ id, status: "CANCELLED" }]);
    const events = await db.select().from(rideEvents).where(eq(rideEvents.rideRequestId, id));
    expect(events.map((e) => e.toStatus).sort()).toEqual(["CANCELLED", "REQUESTED"]);
  });

  test("Rafiq can't cancel Nusrat's ride: to him it doesn't exist", async () => {
    const nusrat = await newPassenger("Nusrat");
    const rafiq = await newPassenger("Rafiq");
    const id = await book(nusrat, "Banani", "Mohakhali");

    expect((await rafiq.post(`/api/requests/${id}/cancel`)).status).toBe(404);
    expect((await nusrat.get("/api/requests/current")).body.request.status).toBe("REQUESTED");
  });

  test("cancelling twice is refused", async () => {
    const nusrat = await newPassenger("Nusrat");
    const id = await book(nusrat, "Banani", "Mohakhali");
    await nusrat.post(`/api/requests/${id}/cancel`);
    expect((await nusrat.post(`/api/requests/${id}/cancel`)).status).toBe(409);
  });

  test("Nusrat leaves the pool: her seat is freed and the ride goes on with Rafiq", async () => {
    const nusrat = await newPassenger("Nusrat");
    const rafiq = await newPassenger("Rafiq");
    const rideId = await rideWith([await book(nusrat, "Banani", "Mohakhali"), await book(rafiq, "Banani", "Gulshan 1")]);
    expect((await rafiq.get("/api/requests/current")).body.request.otherPassengers).toBe(1);

    const mine = (await nusrat.get("/api/requests/current")).body.request.id;
    expect((await nusrat.post(`/api/requests/${mine}/cancel`)).status).toBe(200);

    expect(await rideRow(rideId)).toMatchObject({ status: "ACCEPTED", seatsTaken: 1 });
    expect((await rafiq.get("/api/requests/current")).body.request).toMatchObject({
      status: "MATCHED",
      otherPassengers: 0,
    });
  });

  test("the last passenger cancels: the ride is cancelled and all seats are free", async () => {
    const shirin = await newPassenger("Shirin");
    const id = await book(shirin, "Banani", "Motijheel", 2);
    const rideId = await rideWith([id], "DRIVER_ARRIVED");

    expect((await shirin.post(`/api/requests/${id}/cancel`)).status).toBe(200);
    expect(await rideRow(rideId)).toMatchObject({ status: "CANCELLED", seatsTaken: 0 });
    const rideEventsFor = await db.select().from(rideEvents).where(eq(rideEvents.rideId, rideId));
    expect(rideEventsFor).toContainEqual(expect.objectContaining({ fromStatus: "DRIVER_ARRIVED", toStatus: "CANCELLED" }));
  });

  test("no cancelling once the ride has started", async () => {
    const nusrat = await newPassenger("Nusrat");
    const id = await book(nusrat, "Banani", "Mohakhali");
    const rideId = await rideWith([id], "STARTED");

    expect((await nusrat.post(`/api/requests/${id}/cancel`)).status).toBe(409);
    expect(await rideRow(rideId)).toMatchObject({ status: "STARTED", seatsTaken: 1 });
  });
});
