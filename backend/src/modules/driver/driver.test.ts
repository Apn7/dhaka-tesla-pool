import { afterAll, describe, expect, test } from "vitest";
import { book, loginAs, newDriver, newPassenger, rideWith } from "../../../test/helpers.js";
import { pool } from "../../db/index.js";

afterAll(() => pool.end());

const listedIds = async (agent: Awaited<ReturnType<typeof newDriver>>["agent"]) =>
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
