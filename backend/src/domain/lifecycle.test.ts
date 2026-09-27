import { describe, expect, test } from "vitest";
import { OPEN_RIDE_STATUSES, REQUEST_TRANSITIONS, RIDE_TRANSITIONS, allowedFrom } from "./lifecycle.js";

describe("ride and request lifecycle", () => {
  test("Jashim's ride moves one step at a time, never skipping", () => {
    expect(allowedFrom(RIDE_TRANSITIONS, "DRIVER_ARRIVED")).toEqual(["ACCEPTED"]);
    expect(allowedFrom(RIDE_TRANSITIONS, "STARTED")).toEqual(["DRIVER_ARRIVED"]);
    expect(allowedFrom(RIDE_TRANSITIONS, "COMPLETED")).toEqual(["STARTED"]);
  });

  test("Nusrat's request moves one step at a time, never skipping", () => {
    expect(allowedFrom(REQUEST_TRANSITIONS, "MATCHED")).toEqual(["REQUESTED"]);
    expect(allowedFrom(REQUEST_TRANSITIONS, "DRIVER_ARRIVED")).toEqual(["MATCHED"]);
    expect(allowedFrom(REQUEST_TRANSITIONS, "STARTED")).toEqual(["DRIVER_ARRIVED"]);
    expect(allowedFrom(REQUEST_TRANSITIONS, "COMPLETED")).toEqual(["STARTED"]);
  });

  test("nothing goes back to the first status", () => {
    expect(allowedFrom(RIDE_TRANSITIONS, "ACCEPTED")).toEqual([]);
    expect(allowedFrom(REQUEST_TRANSITIONS, "REQUESTED")).toEqual([]);
  });

  test("cancel is allowed only before the ride starts", () => {
    expect(allowedFrom(RIDE_TRANSITIONS, "CANCELLED")).toEqual(["ACCEPTED", "DRIVER_ARRIVED"]);
    expect(allowedFrom(REQUEST_TRANSITIONS, "CANCELLED")).toEqual([
      "REQUESTED",
      "MATCHED",
      "DRIVER_ARRIVED",
    ]);
  });

  test("COMPLETED and CANCELLED are final", () => {
    for (const map of [RIDE_TRANSITIONS, REQUEST_TRANSITIONS]) {
      expect(map.COMPLETED).toEqual([]);
      expect(map.CANCELLED).toEqual([]);
    }
  });

  test("Shirin can join until Jashim taps Start", () => {
    expect(OPEN_RIDE_STATUSES).toEqual(["ACCEPTED", "DRIVER_ARRIVED"]);
  });
});
