import { SignJWT, jwtVerify } from "jose";
import type { userRole } from "../db/schema.js";

export type Role = (typeof userRole.enumValues)[number];
export type TokenUser = { id: string; role: Role };

// A short secret can be guessed offline from any token, and then anyone can sign as anyone
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be set to at least 32 characters");
}
const secret = new TextEncoder().encode(jwtSecret);

// One login lasts a day. No refresh tokens: a stolen token works until it expires
// (listed under known limitations). The cookie uses the same lifetime.
export const TOKEN_TTL_SECONDS = 24 * 60 * 60;
export const TOKEN_COOKIE = "token";

export function signToken(user: TokenUser): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

// The user inside a valid token, or null if it is forged, expired or garbage
export async function verifyToken(token: string): Promise<TokenUser | null> {
  try {
    const { payload } = await jwtVerify<{ role: Role }>(token, secret, { algorithms: ["HS256"] });
    return payload.sub ? { id: payload.sub, role: payload.role } : null;
  } catch {
    return null;
  }
}
