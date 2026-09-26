// Demo data: the story cast, Dhaka areas and measured roads.
// Safe to run many times: existing rows are kept, road distances are refreshed.
// Run: pnpm db:seed (local) or the one-shot `seed` service in docker compose.
import { inArray, sql } from "drizzle-orm";
import { hashPassword } from "../lib/password.js";
import { db, pool } from "./index.js";
import { areas, roads, users, vehicles } from "./schema.js";

const DEMO_PASSWORD = "bullet123";

const AREAS = [
  "Banani",
  "Gulshan 1",
  "Gulshan 2",
  "Mohakhali",
  "Tejgaon",
  "Farmgate",
  "Dhanmondi",
  "Mirpur",
  "Uttara",
  "Bashundhara",
  "Badda",
  "Motijheel",
];

// Driving distance in km between neighbouring areas: Google Maps, shortest route,
// cross-checked with TomTom. Landmarks per area are listed in docs/architecture.md.
const ROADS: [string, string, number][] = [
  ["Banani", "Mohakhali", 2.8],
  ["Banani", "Gulshan 1", 2.9],
  ["Banani", "Gulshan 2", 1.9],
  ["Banani", "Mirpur", 5.7],
  ["Banani", "Uttara", 12.6],
  ["Gulshan 1", "Gulshan 2", 1.6],
  ["Gulshan 1", "Mohakhali", 3.2],
  ["Gulshan 1", "Badda", 1.5],
  ["Gulshan 2", "Bashundhara", 6.1],
  ["Mohakhali", "Tejgaon", 1.6],
  ["Mohakhali", "Farmgate", 4.0],
  ["Tejgaon", "Farmgate", 2.3],
  ["Tejgaon", "Motijheel", 4.9],
  ["Farmgate", "Dhanmondi", 2.0],
  ["Farmgate", "Mirpur", 6.9],
  ["Farmgate", "Motijheel", 6.0],
  ["Dhanmondi", "Mirpur", 8.1],
  ["Dhanmondi", "Motijheel", 6.9],
  ["Mirpur", "Uttara", 11.2],
  ["Uttara", "Bashundhara", 8.0],
  ["Bashundhara", "Badda", 4.8],
  ["Badda", "Motijheel", 8.0],
];

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
  await tx
    .insert(areas)
    .values(AREAS.map((name) => ({ name })))
    .onConflictDoNothing();
  const areaRows = await tx.select().from(areas);
  const areaId = new Map(areaRows.map((a) => [a.name, a.id]));

  const roadRows = ROADS.map(([from, to, km]) => {
    // Roads are stored once with area_a_id < area_b_id (see the roads_area_order CHECK)
    const [a, b] = [areaId.get(from)!, areaId.get(to)!].sort();
    return { areaAId: a, areaBId: b, distanceM: Math.round(km * 1000) };
  });
  await tx
    .insert(roads)
    .values(roadRows)
    .onConflictDoUpdate({
      target: [roads.areaAId, roads.areaBId],
      set: { distanceM: sql`excluded.distance_m` },
    });

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

console.log(
  `Seed done: ${AREAS.length} areas, ${ROADS.length} roads, ${USERS.length} users, ${VEHICLES.length} vehicles`,
);
await pool.end();
