CREATE TYPE "public"."request_status" AS ENUM('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('PASSENGER', 'DRIVER');--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "areas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ride_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ride_id" uuid,
	"ride_request_id" uuid,
	"actor_id" uuid,
	"from_status" text,
	"to_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_events_has_subject" CHECK ("ride_events"."ride_id" IS NOT NULL OR "ride_events"."ride_request_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "ride_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"passenger_id" uuid NOT NULL,
	"pickup_area_id" uuid NOT NULL,
	"dropoff_area_id" uuid NOT NULL,
	"seats" smallint NOT NULL,
	"distance_m" integer NOT NULL,
	"fare_paisa" integer NOT NULL,
	"status" "request_status" DEFAULT 'REQUESTED' NOT NULL,
	"ride_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_requests_different_areas" CHECK ("ride_requests"."pickup_area_id" <> "ride_requests"."dropoff_area_id"),
	CONSTRAINT "ride_requests_seats_range" CHECK ("ride_requests"."seats" BETWEEN 1 AND 3),
	CONSTRAINT "ride_requests_distance_positive" CHECK ("ride_requests"."distance_m" > 0),
	CONSTRAINT "ride_requests_fare_positive" CHECK ("ride_requests"."fare_paisa" > 0),
	CONSTRAINT "ride_requests_matched_has_ride" CHECK ("ride_requests"."status" = 'CANCELLED' OR ("ride_requests"."status" = 'REQUESTED') = ("ride_requests"."ride_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"pickup_area_id" uuid NOT NULL,
	"status" "ride_status" DEFAULT 'ACCEPTED' NOT NULL,
	"capacity" smallint NOT NULL,
	"seats_taken" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rides_seats_within_capacity" CHECK ("rides"."seats_taken" BETWEEN 0 AND "rides"."capacity")
);
--> statement-breakpoint
CREATE TABLE "roads" (
	"area_a_id" uuid NOT NULL,
	"area_b_id" uuid NOT NULL,
	"distance_m" integer NOT NULL,
	CONSTRAINT "roads_area_a_id_area_b_id_pk" PRIMARY KEY("area_a_id","area_b_id"),
	CONSTRAINT "roads_area_order" CHECK ("roads"."area_a_id" < "roads"."area_b_id"),
	CONSTRAINT "roads_distance_positive" CHECK ("roads"."distance_m" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"driver_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" smallint NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	CONSTRAINT "vehicles_driver_id_unique" UNIQUE("driver_id"),
	CONSTRAINT "vehicles_capacity_range" CHECK ("vehicles"."capacity" BETWEEN 1 AND 6)
);
--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_area_id_areas_id_fk" FOREIGN KEY ("pickup_area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_dropoff_area_id_areas_id_fk" FOREIGN KEY ("dropoff_area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_pickup_area_id_areas_id_fk" FOREIGN KEY ("pickup_area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roads" ADD CONSTRAINT "roads_area_a_id_areas_id_fk" FOREIGN KEY ("area_a_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roads" ADD CONSTRAINT "roads_area_b_id_areas_id_fk" FOREIGN KEY ("area_b_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ride_events_ride_idx" ON "ride_events" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_events_request_idx" ON "ride_events" USING btree ("ride_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_requests_one_active_per_passenger" ON "ride_requests" USING btree ("passenger_id") WHERE "ride_requests"."status" IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED');--> statement-breakpoint
CREATE INDEX "ride_requests_open_by_pickup_idx" ON "ride_requests" USING btree ("status","pickup_area_id");--> statement-breakpoint
CREATE INDEX "ride_requests_ride_idx" ON "ride_requests" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_requests_passenger_history_idx" ON "ride_requests" USING btree ("passenger_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rides_one_active_per_vehicle" ON "rides" USING btree ("vehicle_id") WHERE "rides"."status" IN ('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED');--> statement-breakpoint
CREATE INDEX "rides_vehicle_history_idx" ON "rides" USING btree ("vehicle_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));