// Demo data: the story cast and their Teslas. The Dhaka map is a migration (0001_dhaka_map).
// Safe to run many times: existing rows are kept.
// Run: pnpm db:seed (local) or the one-shot `seed` service in docker compose.
import { inArray } from "drizzle-orm";
import { hashPassword } from "../lib/password.js";
import { db, pool } from "./index.js";
import { users, vehicles } from "./schema.js";

const DEMO_PASSWORD = "bullet123";

const USERS = [
  { name: "Jashim", email: "jashim@teslapool.test", role: "DRIVER" },
  { name: "Kamal", email: "kamal@teslapool.test", role: "DRIVER" },
  { name: "Nusrat", email: "nusrat@teslapool.test", role: "PASSENGER" },
  { name: "Rafiq", email: "rafiq@teslapool.test", role: "PASSENGER" },
  { name: "Shirin", email: "shirin@teslapool.test", role: "PASSENGER" },
] as const;

// Kamal and Toofan exist for the "two drivers accept the same request" race
const VEHICLES = [
  { driverEmail: "jashim@teslapool.test", name: "Bullet", capacity: 3 },
  { driverEmail: "kamal@teslapool.test", name: "Toofan", capacity: 3 },
];

await db.transaction(async (tx) => {
  const userRows = await Promise.all(
    USERS.map(async (u) => ({ ...u, passwordHash: await hashPassword(DEMO_PASSWORD) })),
  );
  await tx.insert(users).values(userRows).onConflictDoNothing();
  const seededUsers = await tx
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, USERS.map((u) => u.email)));
  const userId = new Map(seededUsers.map((u) => [u.email, u.id]));

  await tx
    .insert(vehicles)
    .values(VEHICLES.map((v) => ({ driverId: userId.get(v.driverEmail)!, name: v.name, capacity: v.capacity })))
    .onConflictDoNothing();
});

console.log(`Seed done: ${USERS.length} users, ${VEHICLES.length} vehicles`);
await pool.end();
