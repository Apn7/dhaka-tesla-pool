-- The Dhaka map. The app can't quote a fare or match a ride without it, so it ships
-- as a migration (applied before the server starts), not as demo seed data.
-- ON CONFLICT: databases seeded before this migration already have these rows.
INSERT INTO "areas" ("name") VALUES
  ('Banani'), ('Gulshan 1'), ('Gulshan 2'), ('Mohakhali'), ('Tejgaon'), ('Farmgate'),
  ('Dhanmondi'), ('Mirpur'), ('Uttara'), ('Bashundhara'), ('Badda'), ('Motijheel')
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
-- Driving distance in meters between neighbouring areas: Google Maps, shortest route,
-- cross-checked with TomTom. Stored once per pair, area_a_id < area_b_id (roads_area_order).
INSERT INTO "roads" ("area_a_id", "area_b_id", "distance_m")
SELECT LEAST(a."id", b."id"), GREATEST(a."id", b."id"), r.distance_m
FROM (VALUES
  ('Banani', 'Mohakhali', 2800),
  ('Banani', 'Gulshan 1', 2900),
  ('Banani', 'Gulshan 2', 1900),
  ('Banani', 'Mirpur', 5700),
  ('Banani', 'Uttara', 12600),
  ('Gulshan 1', 'Gulshan 2', 1600),
  ('Gulshan 1', 'Mohakhali', 3200),
  ('Gulshan 1', 'Badda', 1500),
  ('Gulshan 2', 'Bashundhara', 6100),
  ('Mohakhali', 'Tejgaon', 1600),
  ('Mohakhali', 'Farmgate', 4000),
  ('Tejgaon', 'Farmgate', 2300),
  ('Tejgaon', 'Motijheel', 4900),
  ('Farmgate', 'Dhanmondi', 2000),
  ('Farmgate', 'Mirpur', 6900),
  ('Farmgate', 'Motijheel', 6000),
  ('Dhanmondi', 'Mirpur', 8100),
  ('Dhanmondi', 'Motijheel', 6900),
  ('Mirpur', 'Uttara', 11200),
  ('Uttara', 'Bashundhara', 8000),
  ('Bashundhara', 'Badda', 4800),
  ('Badda', 'Motijheel', 8000)
) AS r(from_area, to_area, distance_m)
JOIN "areas" a ON a."name" = r.from_area
JOIN "areas" b ON b."name" = r.to_area
ON CONFLICT DO NOTHING;
