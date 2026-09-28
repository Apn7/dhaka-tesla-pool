import request from "supertest";
import { afterAll, describe, expect, test } from "vitest";
import { app } from "../../app.js";
import { pool } from "../../db/index.js";

afterAll(() => pool.end());

// A fresh email per test, so tests never collide in the shared test database
const newEmail = () => `mitu.${crypto.randomUUID()}@teslapool.test`;

describe("sign up", () => {
  test("creates a passenger and logs them in, even if they ask to be a driver", async () => {
    const agent = request.agent(app);
    const email = newEmail();
    const res = await agent
      .post("/api/auth/signup")
      .send({ name: " Mitu ", email: `  ${email.toUpperCase()} `, password: "secret123", role: "DRIVER" });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Mitu", email, role: "PASSENGER" });
    expect(res.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    expect((await agent.get("/api/auth/me")).body.user.email).toBe(email);
  });

  test("refuses Nusrat's email again, even with different capitals", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ name: "Nusrat", email: "Nusrat@TeslaPool.test", password: "secret123" });
    expect(res.status).toBe(409);
  });

  test("two sign-ups with the same email at the same moment: exactly one wins", async () => {
    const body = { name: "Mitu", email: newEmail(), password: "secret123" };
    const results = await Promise.all([1, 2].map(() => request(app).post("/api/auth/signup").send(body)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  test("rejects bad input and names every wrong field", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ name: "", email: "nope", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: { field: string }) => i.field).sort()).toEqual(["email", "name", "password"]);
  });
});

describe("log in", () => {
  test("Nusrat logs in and the cookie tells the API who she is", async () => {
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .send({ email: "NUSRAT@teslapool.test", password: "bullet123" });
    expect(login.status).toBe(200);
    expect((await agent.get("/api/auth/me")).body.user).toMatchObject({ name: "Nusrat", role: "PASSENGER" });
  });

  test("a wrong password and an unknown email get the same answer", async () => {
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: "nusrat@teslapool.test", password: "wrong-pass" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@teslapool.test", password: "wrong-pass" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  test("after logout the cookie no longer works", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "rafiq@teslapool.test", password: "bullet123" });
    expect((await agent.post("/api/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  test("no cookie or a forged token means not logged in", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    const forged = await request(app)
      .get("/api/auth/me")
      .set("Cookie", "token=eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiRFJJVkVSIn0.fake");
    expect(forged.status).toBe(401);
  });
});
