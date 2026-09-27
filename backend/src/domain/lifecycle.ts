import type { requestStatus, rideStatus } from "../db/schema.js";

// Status names come from the database enums, so the two can't drift apart
export type RideStatus = (typeof rideStatus.enumValues)[number];
export type RequestStatus = (typeof requestStatus.enumValues)[number];

// Where each status may go next; anything not listed is rejected.
// COMPLETED and CANCELLED are final. Cancel is free until STARTED, never after.
export const RIDE_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  ACCEPTED: ["DRIVER_ARRIVED", "CANCELLED"],
  DRIVER_ARRIVED: ["STARTED", "CANCELLED"],
  STARTED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

// After MATCHED, a request follows its ride's status
export const REQUEST_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  REQUESTED: ["MATCHED", "CANCELLED"],
  MATCHED: ["DRIVER_ARRIVED", "CANCELLED"],
  DRIVER_ARRIVED: ["STARTED", "CANCELLED"],
  STARTED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

// Statuses that may move to `to`. Services put these in the atomic
// `UPDATE ... WHERE status IN (...)`, so the rule lives only here.
export function allowedFrom<S extends string>(transitions: Record<S, S[]>, to: S): S[] {
  return (Object.keys(transitions) as S[]).filter((from) => transitions[from].includes(to));
}

// Until the driver taps Start, the car is still at the pickup area, so new passengers
// can join (like Uber, which adds riders before and after the first pickup).
// Listed on its own, not derived from the cancel rule: if cancel rules change later,
// passengers must still never join a car that has left.
export const OPEN_RIDE_STATUSES: RideStatus[] = ["ACCEPTED", "DRIVER_ARRIVED"];
