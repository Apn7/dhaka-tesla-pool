"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getJson, postJson } from "@/lib/api";
import { STATUS_TEXT, km, tk } from "@/lib/format";
import { ui } from "@/lib/ui";
import { RouteLine } from "./parts";

type Area = { id: string; name: string };
type Quote = {
  distanceM: number;
  fare: { baseFarePaisa: number; distanceChargePaisa: number; poolDiscountPaisa: number; farePaisa: number };
};
type Trip = { id: string; status: string; pickupAreaId: string; dropoffAreaId: string; seats: number; farePaisa: number };
type Current = Trip & {
  rideStatus: string | null;
  driverName: string | null;
  vehicleName: string | null;
  otherPassengers: number;
};
type Past = Trip & { createdAt: string };

const CANCELLABLE = ["REQUESTED", "MATCHED", "DRIVER_ARRIVED"];
// Polling, not WebSockets: a ride changes status every few minutes, so 5 s late is fine
const POLL_MS = 5000;

// Status dot colour: yellow while waiting, red while the driver comes, green on the trip
const STATUS_DOT: Record<string, string> = {
  REQUESTED: "bg-signal",
  MATCHED: "bg-brand",
  DRIVER_ARRIVED: "bg-brand",
  STARTED: "bg-go",
};

export function PassengerView() {
  const [areas, setAreas] = useState<Area[]>([]);
  // undefined = not loaded yet, null = no active ride
  const [current, setCurrent] = useState<Current | null>();
  const [history, setHistory] = useState<Past[]>([]);
  const [error, setError] = useState<string | null>(null);
  // A failed poll shows until the next one works
  const [pollError, setPollError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    () =>
      Promise.all([
        getJson<{ request: Current | null }>("/requests/current"),
        getJson<{ requests: Past[] }>("/requests/history"),
      ]).then(([now, past]) => {
        if (now.ok) setCurrent(now.data.request);
        if (past.ok) setHistory(past.data.requests);
        setPollError(now.ok ? null : now.error.error);
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

  async function cancel(id: string) {
    setBusy(true);
    const res = await postJson(`/requests/${id}/cancel`);
    setError(res.ok ? null : res.error.error);
    await refresh();
    setBusy(false);
  }

  const alert = (pollError ?? error) && (
    <p role="alert" className="text-sm text-brand">
      {pollError ?? error}
    </p>
  );

  if (current === undefined) return alert || <p className="text-muted">Loading your rides…</p>;

  return (
    <>
      {alert}

      {current ? (
        <section className={`${ui.panel} flex flex-col gap-5`} aria-live="polite">
          <div className="flex items-center gap-3">
            <span className={`size-3 rounded-full ${STATUS_DOT[current.status] ?? "bg-muted"}`} />
            <h1 className={ui.heading}>{STATUS_TEXT[current.status]}</h1>
          </div>

          <RouteLine
            from={<p className="font-medium">{areaName(current.pickupAreaId)}</p>}
            to={[<p key="dropoff" className="font-medium">{areaName(current.dropoffAreaId)}</p>]}
          />

          <dl className="grid grid-cols-2 gap-y-2 border-t border-line pt-4 text-sm">
            <dt className="text-muted">Your fare, cash</dt>
            <dd className="text-right font-display text-xl font-bold">{tk(current.farePaisa)}</dd>
            <dt className="text-muted">Seats</dt>
            <dd className="text-right">{current.seats}</dd>
            {current.driverName && (
              <>
                <dt className="text-muted">Driver</dt>
                <dd className="text-right">
                  {current.driverName} in {current.vehicleName}
                </dd>
              </>
            )}
            {current.otherPassengers > 0 && (
              <>
                <dt className="text-muted">Sharing with</dt>
                <dd className="text-right">
                  {current.otherPassengers} other passenger{current.otherPassengers > 1 && "s"}
                </dd>
              </>
            )}
          </dl>

          {CANCELLABLE.includes(current.status) && (
            <button onClick={() => cancel(current.id)} disabled={busy} className={ui.secondary}>
              {busy ? "Cancelling…" : "Cancel ride"}
            </button>
          )}
        </section>
      ) : (
        <BookingForm areas={areas} onBooked={refresh} />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold">Past rides</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Your finished and cancelled rides will show up here.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl bg-white px-4">
            {history.map((trip) => (
              <li key={trip.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {areaName(trip.pickupAreaId)} to {areaName(trip.dropoffAreaId)}
                  </p>
                  <p className="text-muted">{new Date(trip.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className={trip.status === "CANCELLED" ? "text-muted line-through" : "font-medium"}>
                    {tk(trip.farePaisa)}
                  </p>
                  <p className="text-muted">{STATUS_TEXT[trip.status]}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function BookingForm({ areas, onBooked }: { areas: Area[]; onBooked: () => Promise<void> }) {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [seats, setSeats] = useState(1);
  // The quote remembers which choice it belongs to, so a slow answer never shows the wrong price
  const [quote, setQuote] = useState<{ for: string; data: Quote } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choice = `${pickup}|${dropoff}|${seats}`;
  const ready = pickup !== "" && dropoff !== "" && pickup !== dropoff;
  const shown = quote?.for === choice ? quote.data : null;

  useEffect(() => {
    if (!ready) return;
    getJson<Quote>(`/requests/quote?pickupAreaId=${pickup}&dropoffAreaId=${dropoff}&seats=${seats}`).then(
      (res) => res.ok && setQuote({ for: choice, data: res.data }),
    );
  }, [ready, pickup, dropoff, seats, choice]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await postJson("/requests", { pickupAreaId: pickup, dropoffAreaId: dropoff, seats });
    if (res.ok) await onBooked(); // the form goes away once the new ride shows
    else setError(res.error.error);
    setBusy(false);
  }

  const areaSelect = (label: string, value: string, onChange: (id: string) => void, skip = "") => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={ui.field} required>
      <option value="">{label}</option>
      {areas
        .filter((a) => a.id !== skip)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
    </select>
  );

  return (
    <form onSubmit={submit} className={`${ui.panel} flex flex-col gap-5`}>
      <h1 className={ui.heading}>Where to?</h1>

      <RouteLine
        from={areaSelect("Pickup area", pickup, setPickup)}
        to={[areaSelect("Drop-off area", dropoff, setDropoff, pickup)]}
      />

      <fieldset className="flex items-center justify-between gap-4">
        <legend className="sr-only">Seats</legend>
        <span className="text-sm font-medium">Seats</span>
        <div className="flex rounded-lg border border-line bg-canvas p-1">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={seats === n}
              onClick={() => setSeats(n)}
              className={`w-11 rounded-md py-1.5 font-medium ${seats === n ? "bg-white shadow-sm" : "text-muted"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      {ready && shown && (
        <dl className="grid grid-cols-2 gap-y-1.5 border-t border-line pt-4 text-sm">
          <dt className="text-muted">Road distance</dt>
          <dd className="text-right">{km(shown.distanceM)}</dd>
          <dt className="text-muted">Base fare</dt>
          <dd className="text-right">{tk(shown.fare.baseFarePaisa)}</dd>
          <dt className="text-muted">Distance charge</dt>
          <dd className="text-right">{tk(shown.fare.distanceChargePaisa)}</dd>
          <dt className="text-muted">Pool discount, 20%</dt>
          <dd className="text-right text-go">−{tk(shown.fare.poolDiscountPaisa)}</dd>
          <dt className="pt-2 font-medium">You pay in cash</dt>
          <dd className="pt-2 text-right font-display text-3xl font-bold">{tk(shown.fare.farePaisa)}</dd>
        </dl>
      )}

      {error && (
        <p role="alert" className="text-sm text-brand">
          {error}
        </p>
      )}
      <button type="submit" disabled={!ready || busy} className={ui.primary}>
        {busy ? "Requesting…" : "Request ride"}
      </button>
    </form>
  );
}
