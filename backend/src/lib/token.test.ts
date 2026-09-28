import { afterEach, describe, expect, test, vi } from "vitest";
import { TOKEN_TTL_SECONDS, signToken, verifyToken } from "./token.js";

const nusrat = { id: "0199a000-0000-7000-8000-000000000001", role: "PASSENGER" } as const;

describe("login tokens", () => {
  afterEach(() => vi.useRealTimers());

  test("a token we signed gives back the same user", async () => {
    expect(await verifyToken(await signToken(nusrat))).toEqual(nusrat);
  });

  test("Nusrat can't edit her token to become a driver", async () => {
    const [header, , signature] = (await signToken(nusrat)).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: nusrat.id, role: "DRIVER" })).toString("base64url");
    expect(await verifyToken(`${header}.${forged}.${signature}`)).toBeNull();
  });

  test("a token stops working after a day", async () => {
    vi.useFakeTimers();
    const token = await signToken(nusrat);
    vi.advanceTimersByTime((TOKEN_TTL_SECONDS + 1) * 1000);
    expect(await verifyToken(token)).toBeNull();
  });

  test("garbage is not a token", async () => {
    expect(await verifyToken("not-a-token")).toBeNull();
  });
});
