import { afterAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { book, loginAs, newDriver, newPassenger, rideRow, rideWith, type Agent } from "../../../test/helpers.js";
import { db, pool } from "../../db/index.js";
import { rideEvents, rideRequests } from "../../db/schema.js";

afterAll(() => pool.end());

const listedIds = async (agent: Agent) =>
  ((await agent.get("/api/driver/requests")).body.requests as { id: string }[]).map((r) => r.id);

describe("driver basics", () => {
  test("passengers can't use driver endpoints", async () => {
    expect((await (await loginAs("nusrat")).get("/api/driver/me")).status).toBe(403);
  });

  test("Jashim sees his Tesla and goes offline and online", async () => {
    const jashim = (await newDriver("Jashim", false)).agent;
    expect((await jashim.get("/api/driver/me")).body).toMatchObject({
      vehicle: { name: "Bullet", capacity: 3, isOnline: false },
      ride: null,
    });
    expect((await jashim.post("/api/driver/online").send({ online: true })).body.vehicle.isOnline).toBe(true);
  });

  test("offline, he sees no requests; online, he sees waiting ones", async () => {
    const jashim = (await newDriver("Jashim", false)).agent;
    const nusratRequest = await book(await newPassenger("Nusrat"), "Banani", "Mohakhali");

    expect(await listedIds(jashim)).toEqual([]);
    await jashim.post("/api/driver/online").send({ online: true });
    expect(await listedIds(jashim)).toContain(nusratRequest);
  });
});

describe("requests that fit an open ride (real Dhaka map)", () => {
  test("with Nusrat on board (Banani → Mohakhali), Rafiq to Gulshan 1 fits, Uttara doesn't", async () => {
    const { agent: jashim, vehicleId } = await newDriver();
    await rideWith([await book(await newPassenger("Nusrat"), "Banani", "Mohakhali")], "ACCEPTED", vehicleId);

    const rafiq = await book(await newPassenger("Rafiq"), "Banani", "Gulshan 1"); // Rafiq's detour +3.1 km
    const toUttara = await book(await newPassenger("Shirin"), "Banani", "Uttara"); // detour +5.6 km
    const otherPickup = await book(await newPassenger("Shirin"), "Gulshan 1", "Mohakhali");
    const tooBig = await book(await newPassenger("Shirin"), "Banani", "Gulshan 1", 3); // 2 seats left

    const listed = await listedIds(jashim);
    expect(listed).toContain(rafiq);
    expect(listed).not.toContain(toUttara);
    expect(listed).not.toContain(otherPickup);
    expect(listed).not.toContain(tooBig);
  });

  test("once the ride has started, nobody can join", async () => {
    const { agent: jashim, vehicleId } = await newDriver();
    await rideWith([await book(await newPassenger("Nusrat"), "Banani", "Mohakhali")], "STARTED", vehicleId);
    await book(await newPassenger("Rafiq"), "Banani", "Gulshan 1");
    expect(await listedIds(jashim)).toEqual([]);
  });

  test("his ride lists passengers in drop-off order: Mohakhali before Gulshan 1", async () => {
    const { agent: jashim, vehicleId } = await newDriver();
    const rafiq = await book(await newPassenger("Rafiq"), "Banani", "Gulshan 1");
    const nusrat = await book(await newPassenger("Nusrat"), "Banani", "Mohakhali");
    await rideWith([rafiq, nusrat], "ACCEPTED", vehicleId);

    const { ride } = (await jashim.get("/api/driver/me")).body;
    expect(ride).toMatchObject({ status: "ACCEPTED", seatsTaken: 2, capacity: 3 });
    expect(ride.passengers.map((p: { name: string }) => p.name)).toEqual(["Nusrat", "Rafiq"]);
  });
});

const accept = (driver: Agent, requestId: string) => driver.post(`/api/driver/requests/${requestId}/accept`);
const requestRow = async (id: string) => (await db.select().from(rideRequests).where(eq(rideRequests.id, id)))[0];

describe("accepting requests into a pool", () => {
  test("Jashim accepts Nusrat, then Rafiq joins the same ride", async () => {
    const jashim = (await newDriver()).agent;
    const nusrat = await newPassenger("Nusrat");
    const rafiq = await newPassenger("Rafiq");
    const nusratId = await book(nusrat, "Banani", "Mohakhali");
    const rafiqId = await book(rafiq, "Banani", "Gulshan 1");

    const first = await accept(jashim, nusratId);
    expect(first.status).toBe(200);
    expect((await nusrat.get("/api/requests/current")).body.request).toMatchObject({
      status: "MATCHED",
      rideStatus: "ACCEPTED",
      driverName: "Jashim",
      vehicleName: "Bullet",
    });

    const second = await accept(jashim, rafiqId);
    expect(second.body.rideId).toBe(first.body.rideId); // one pool
    expect(await rideRow(first.body.rideId)).toMatchObject({ status: "ACCEPTED", seatsTaken: 2 });
    expect((await nusrat.get("/api/requests/current")).body.request.otherPassengers).toBe(1);

    const events = await db.select().from(rideEvents).where(eq(rideEvents.rideId, first.body.rideId));
    expect(events.map((e) => e.toStatus).sort()).toEqual(["ACCEPTED", "MATCHED", "MATCHED"]);
  });

  test("the backend re-checks the route: someone bound for Uttara can't join Nusrat (+5.6 km)", async () => {
    const jashim = (await newDriver()).agent;
    await accept(jashim, await book(await newPassenger("Nusrat"), "Banani", "Mohakhali"));
    const uttara = await book(await newPassenger("Shirin"), "Banani", "Uttara");

    expect((await accept(jashim, uttara)).status).toBe(409);
    expect((await requestRow(uttara)).status).toBe("REQUESTED");
  });

  test("an offline driver can't accept", async () => {
    const jashim = (await newDriver("Jashim", false)).agent;
    const nusratId = await book(await newPassenger("Nusrat"), "Banani", "Mohakhali");
    expect((await accept(jashim, nusratId)).status).toBe(409);
  });

  test("joining after the driver arrived: the passenger goes straight to 'driver arrived'", async () => {
    const { agent: jashim, vehicleId } = await newDriver();
    await rideWith([await book(await newPassenger("Nusrat"), "Banani", "Mohakhali")], "DRIVER_ARRIVED", vehicleId);
    const rafiqId = await book(await newPassenger("Rafiq"), "Banani", "Gulshan 1");

    expect((await accept(jashim, rafiqId)).status).toBe(200);
    expect((await requestRow(rafiqId)).status).toBe("DRIVER_ARRIVED");
    const events = await db.select().from(rideEvents).where(eq(rideEvents.rideRequestId, rafiqId));
    expect(events.map((e) => e.toStatus)).toEqual(expect.arrayContaining(["MATCHED", "DRIVER_ARRIVED"]));
  });
});

// PRD Section 12: two concurrent requests can't corrupt pool capacity
describe("races, fired at the same moment against real Postgres", () => {
  test("last seat: Bullet has 1 seat left and two requests are accepted at once; only one gets it", async () => {
    const { agent: jashim, vehicleId } = await newDriver();
    const rideId = await rideWith([await book(await newPassenger("Rafiq"), "Banani", "Gulshan 1", 2)], "ACCEPTED", vehicleId);
    const nusratId = await book(await newPassenger("Nusrat"), "Banani", "Mohakhali");
    const shirinId = await book(await newPassenger("Shirin"), "Banani", "Mohakhali");

    const results = await Promise.all([accept(jashim, nusratId), accept(jashim, shirinId)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await rideRow(rideId)).toMatchObject({ seatsTaken: 3, capacity: 3 });
  });

  test("Jashim and Kamal accept the same request at once; one wins, the other gets no ride", async () => {
    const jashim = (await newDriver("Jashim")).agent;
    const kamal = (await newDriver("Kamal")).agent;
    const nusratId = await book(await newPassenger("Nusrat"), "Banani", "Mohakhali");

    const results = await Promise.all([accept(jashim, nusratId), accept(kamal, nusratId)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);

    const rides = await Promise.all([jashim, kamal].map(async (d) => (await d.get("/api/driver/me")).body.ride));
    expect(rides.filter((r) => r !== null)).toHaveLength(1); // the loser's new ride was rolled back
    expect((await requestRow(nusratId)).rideId).toBe(rides.find((r) => r !== null).id);
  });

  test("Nusrat cancels while Jashim accepts: never 'cancelled but still holding a seat'", async () => {
    // A few rounds, so both orders (cancel first, accept first) get a chance to happen
    for (let round = 0; round < 5; round++) {
      const jashim = (await newDriver()).agent;
      const nusrat = await newPassenger("Nusrat");
      const nusratId = await book(nusrat, "Banani", "Mohakhali");

      const [cancelled, accepted] = await Promise.all([
        nusrat.post(`/api/requests/${nusratId}/cancel`),
        accept(jashim, nusratId),
      ]);
      expect([cancelled.status, accepted.status].sort()).toEqual([200, 409]);

      const request = await requestRow(nusratId);
      const ride = (await jashim.get("/api/driver/me")).body.ride;
      if (request.status === "CANCELLED") expect(ride).toBeNull();
      else expect(ride).toMatchObject({ seatsTaken: 1, passengers: [{ name: "Nusrat" }] });
    }
  });
});

const step = (driver: Agent, name: "arrive" | "start" | "complete") => driver.post(`/api/driver/ride/${name}`);

describe("arrive, start and complete", () => {
  test("Nusrat and Rafiq's pooled trip from Banani, start to finish", async () => {
    const jashim = (await newDriver()).agent;
    const nusrat = await newPassenger("Nusrat");
    const rafiq = await newPassenger("Rafiq");
    const { rideId } = (await accept(jashim, await book(nusrat, "Banani", "Mohakhali"))).body;
    await accept(jashim, await book(rafiq, "Banani", "Gulshan 1"));

    for (const [name, status] of [
      ["arrive", "DRIVER_ARRIVED"],
      ["start", "STARTED"],
    ] as const) {
      expect((await step(jashim, name)).status).toBe(200);
      expect((await rideRow(rideId)).status).toBe(status);
      // Both passengers move with the ride
      for (const passenger of [nusrat, rafiq]) {
        expect((await passenger.get("/api/requests/current")).body.request.status).toBe(status);
      }
    }

    expect((await step(jashim, "complete")).status).toBe(200);
    expect((await jashim.get("/api/driver/me")).body.ride).toBeNull();
    expect((await nusrat.get("/api/requests/history")).body.requests).toMatchObject([
      { status: "COMPLETED", farePaisa: 5088 },
    ]);
    // Cash collected = Nusrat 50.88 + Rafiq 51.84 = 102.72 Tk
    expect((await jashim.get("/api/driver/history")).body.rides).toMatchObject([
      { id: rideId, status: "COMPLETED", passengers: 2, cashPaisa: 10272 },
    ]);

    // Every change is in the history table: 4 for the ride, 4 for each passenger
    const events = await db.select().from(rideEvents).where(eq(rideEvents.rideId, rideId));
    expect(events.filter((e) => e.rideRequestId === null).map((e) => e.toStatus).sort()).toEqual(
      ["ACCEPTED", "COMPLETED", "DRIVER_ARRIVED", "STARTED"],
    );
    expect(events.filter((e) => e.rideRequestId !== null)).toHaveLength(8);
  });

  test("steps can't be skipped: no start before arrival, no complete before start", async () => {
    const jashim = (await newDriver()).agent;
    const { rideId } = (await accept(jashim, await book(await newPassenger("Nusrat"), "Banani", "Mohakhali"))).body;

    expect((await step(jashim, "start")).status).toBe(409);
    expect((await step(jashim, "complete")).status).toBe(409);
    expect((await rideRow(rideId)).status).toBe("ACCEPTED");
  });

  test("a passenger who cancelled stays cancelled and isn't paid for", async () => {
    const jashim = (await newDriver()).agent;
    const nusrat = await newPassenger("Nusrat");
    const nusratId = await book(nusrat, "Banani", "Mohakhali");
    await accept(jashim, nusratId);
    await accept(jashim, await book(await newPassenger("Rafiq"), "Banani", "Gulshan 1"));
    await nusrat.post(`/api/requests/${nusratId}/cancel`);

    for (const name of ["arrive", "start", "complete"] as const) await step(jashim, name);
    expect((await requestRow(nusratId)).status).toBe("CANCELLED");
    expect((await jashim.get("/api/driver/history")).body.rides[0]).toMatchObject({ passengers: 1, cashPaisa: 5184 });
  });

  test("going offline mid-trip is allowed; the ride goes on", async () => {
    const jashim = (await newDriver()).agent;
    await accept(jashim, await book(await newPassenger("Nusrat"), "Banani", "Mohakhali"));
    await step(jashim, "arrive");
    await step(jashim, "start");
    await jashim.post("/api/driver/online").send({ online: false });
    expect((await step(jashim, "complete")).status).toBe(200);
  });

  test("no active ride, nothing to move", async () => {
    expect((await step((await newDriver()).agent, "arrive")).status).toBe(404);
  });

  test("Nusrat cancels while Jashim taps Start: no deadlock, and never half-done", async () => {
    for (let round = 0; round < 5; round++) {
      const jashim = (await newDriver()).agent;
      const nusrat = await newPassenger("Nusrat");
      const nusratId = await book(nusrat, "Banani", "Mohakhali");
      const { rideId } = (await accept(jashim, nusratId)).body;
      await accept(jashim, await book(await newPassenger("Rafiq"), "Banani", "Gulshan 1"));
      await step(jashim, "arrive");

      const [cancelled, started] = await Promise.all([
        nusrat.post(`/api/requests/${nusratId}/cancel`),
        step(jashim, "start"),
      ]);
      expect(started.status).toBe(200); // Rafiq is still on board either way
      const ride = await rideRow(rideId);
      if (cancelled.status === 200) {
        expect((await requestRow(nusratId)).status).toBe("CANCELLED");
        expect(ride).toMatchObject({ status: "STARTED", seatsTaken: 1 });
      } else {
        expect(cancelled.status).toBe(409); // too late: the ride had started
        expect((await requestRow(nusratId)).status).toBe("STARTED");
        expect(ride).toMatchObject({ status: "STARTED", seatsTaken: 2 });
      }
    }
  });
});
