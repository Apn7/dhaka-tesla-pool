"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson, postJson } from "@/lib/api";
import { STATUS_TEXT, tk } from "@/lib/format";
import { ui } from "@/lib/ui";
import { RouteLine } from "./parts";

type Area = { id: string; name: string };
type Vehicle = { name: string; capacity: number; isOnline: boolean };
type Passenger = { requestId: string; name: string; dropoffAreaId: string; seats: number; farePaisa: number };
type Ride = {
  id: string;
  status: "ACCEPTED" | "DRIVER_ARRIVED" | "STARTED";
  pickupAreaId: string;
  capacity: number;
  seatsTaken: number;
  passengers: Passenger[]; // already in drop-off order
};
type Waiting = {
  id: string;
  passengerName: string;
  pickupAreaId: string;
  dropoffAreaId: string;
  seats: number;
  farePaisa: number;
};
type PastRide = { id: string; status: string; pickupAreaId: string; createdAt: string; passengers: number; cashPaisa: number };

// Polling, not WebSockets, like the passenger screen
const POLL_MS = 5000;

// The one thing the driver does next on an active ride
const NEXT_STEP = {
  ACCEPTED: { step: "arrive", label: "I've arrived at pickup" },
  DRIVER_ARRIVED: { step: "start", label: "Start trip" },
  STARTED: { step: "complete", label: "Complete trip" },
} as const;

export function DriverView() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [ride, setRide] = useState<Ride | null>(null);
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [history, setHistory] = useState<PastRide[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    () =>
      Promise.all([
        getJson<{ vehicle: Vehicle; ride: Ride | null }>("/driver/me"),
        getJson<{ requests: Waiting[] }>("/driver/requests"),
        getJson<{ rides: PastRide[] }>("/driver/history"),
      ]).then(([me, open, past]) => {
        if (me.ok) {
          setVehicle(me.data.vehicle);
          setRide(me.data.ride);
        }
        if (open.ok) setWaiting(open.data.requests);
        if (past.ok) setHistory(past.data.rides);
      }),
    [],
  );

  useEffect(() => {
    getJson<{ areas: Area[] }>("/areas").then((res) => res.ok && setAreas(res.data.areas));
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? "";

  // Every driver action: show the server's "no" if there is one (full car, taken request), then reload
  async function act(path: string, body?: unknown) {
    setBusy(true);
    const res = await postJson(path, body);
    setError(res.ok ? null : res.error.error);
    await refresh();
    setBusy(false);
  }

  if (!vehicle) return <p className="text-muted">Loading your Tesla…</p>;

  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-brand">
          {error}
        </p>
      )}

      <section className={`${ui.panel} flex items-center justify-between gap-4`}>
        <div>
          <h1 className={ui.heading}>{vehicle.name}</h1>
          <p className="text-sm text-muted">
            {vehicle.isOnline ? "Online. Ride requests come to you." : "Offline. You get no ride requests."}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={vehicle.isOnline}
          aria-label="Online"
          disabled={busy}
          onClick={() => act("/driver/online", { online: !vehicle.isOnline })}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${vehicle.isOnline ? "bg-go" : "bg-line"}`}
        >
          <span
            className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform ${
              vehicle.isOnline ? "translate-x-6" : ""
            }`}
          />
        </button>
      </section>

      {ride && (
        <RideCard
          ride={ride}
          areaName={areaName}
          busy={busy}
          onStep={(step) => act(`/driver/ride/${step}`)}
        />
      )}

      {ride?.status !== "STARTED" && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-bold">{ride ? "Can join your ride" : "Waiting for a ride"}</h2>
          {!vehicle.isOnline ? (
            <p className="text-sm text-muted">Go online to see who needs a ride.</p>
          ) : waiting.length === 0 ? (
            <p className="text-sm text-muted">
              {ride ? "Nobody going your way right now." : "Nobody is waiting right now. New requests show up here."}
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl bg-white px-4">
              {waiting.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {areaName(r.pickupAreaId)} to {areaName(r.dropoffAreaId)}
                    </p>
                    <p className="text-muted">
                      {r.passengerName}, {r.seats} seat{r.seats > 1 && "s"}, {tk(r.farePaisa)}
                    </p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => act(`/driver/requests/${r.id}/accept`)}
                    className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
                  >
                    Accept
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold">Past rides</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Your completed and cancelled rides will show up here.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl bg-white px-4">
            {history.map((past) => (
              <li key={past.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    From {areaName(past.pickupAreaId)}, {past.passengers} passenger{past.passengers !== 1 && "s"}
                  </p>
                  <p className="text-muted">{new Date(past.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{tk(past.cashPaisa)}</p>
                  <p className="text-muted">{STATUS_TEXT[past.status]}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function RideCard({
  ride,
  areaName,
  busy,
  onStep,
}: {
  ride: Ride;
  areaName: (id: string) => string;
  busy: boolean;
  onStep: (step: string) => void;
}) {
  const pickup = areaName(ride.pickupAreaId);
  const heading = { ACCEPTED: `Head to ${pickup}`, DRIVER_ARRIVED: `Waiting at ${pickup}`, STARTED: "On the trip" };
  const next = NEXT_STEP[ride.status];
  const cash = ride.passengers.reduce((sum, p) => sum + p.farePaisa, 0);

  return (
    <section className={`${ui.panel} flex flex-col gap-5`} aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`size-3 shrink-0 rounded-full ${ride.status === "STARTED" ? "bg-go" : "bg-brand"}`} />
          <h2 className={ui.heading}>{heading[ride.status]}</h2>
        </div>
        <Seats taken={ride.seatsTaken} capacity={ride.capacity} />
      </div>

      {/* The stops in order: pickup, then each drop-off along the shortest route */}
      <RouteLine
        from={
          <>
            <p className="font-medium">{pickup}</p>
            <p className="text-sm text-muted">Pick up everyone</p>
          </>
        }
        to={ride.passengers.map((p, i) => (
          <div key={p.requestId} className="flex justify-between gap-3">
            <div>
              <p className="font-medium">
                {i + 1}. {areaName(p.dropoffAreaId)}
              </p>
              <p className="text-sm text-muted">
                Drop {p.name}, {p.seats} seat{p.seats > 1 && "s"}
              </p>
            </div>
            <p className="font-medium">{tk(p.farePaisa)}</p>
          </div>
        ))}
      />

      <div className="flex items-baseline justify-between border-t border-line pt-4">
        <span className="text-sm text-muted">Cash to collect</span>
        <span className="font-display text-2xl font-bold">{tk(cash)}</span>
      </div>

      <button onClick={() => onStep(next.step)} disabled={busy} className={ui.primary}>
        {next.label}
      </button>
    </section>
  );
}

// Filled blocks for taken seats: ■■□ = 2 of 3
function Seats({ taken, capacity }: { taken: number; capacity: number }) {
  return (
    <div className="flex shrink-0 items-center gap-2 text-sm text-muted">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: capacity }, (_, i) => (
          <span key={i} className={`h-4 w-3 rounded-sm border ${i < taken ? "border-ink bg-ink" : "border-muted bg-white"}`} />
        ))}
      </div>
      {taken} of {capacity} seats
    </div>
  );
}
