// Integer paisa → "50.88 Tk" without floating point, like everywhere else money is handled
export function tk(paisa: number) {
  return `${Math.floor(paisa / 100)}.${String(paisa % 100).padStart(2, "0")} Tk`;
}

export const km = (meters: number) => `${(meters / 1000).toFixed(1)} km`;

// Request and ride statuses in plain words
export const STATUS_TEXT: Record<string, string> = {
  REQUESTED: "Waiting for a driver",
  MATCHED: "Driver on the way",
  ACCEPTED: "Driving to pickup",
  DRIVER_ARRIVED: "Driver has arrived",
  STARTED: "On the trip",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
