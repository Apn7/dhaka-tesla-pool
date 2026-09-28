import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "../../app.js";
import { pool } from "../../db/index.js";

afterAll(() => pool.end());

async function loginAs(name: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email: `${name}@teslapool.test`, password: "bullet123" });
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
