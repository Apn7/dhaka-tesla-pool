"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getJson, postJson } from "@/lib/api";
import { STATUS_TEXT, km, tk } from "@/lib/format";

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

const card = "rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
const button = "rounded-md bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-50";

export function PassengerView() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [history, setHistory] = useState<Past[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      Promise.all([
        getJson<{ request: Current | null }>("/requests/current"),
        getJson<{ requests: Past[] }>("/requests/history"),
      ]).then(([now, past]) => {
        if (now.ok) setCurrent(now.data.request);
        if (past.ok) setHistory(past.data.requests);
      }),
    [],
  );

  useEffect(() => {
    getJson<{ areas: Area[] }>("/areas").then((res) => res.ok && setAreas(res.data.areas));
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? "…";

  async function cancel(id: string) {
    const res = await postJson(`/requests/${id}/cancel`);
    setError(res.ok ? null : res.error.error);
    refresh();
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {current ? (
        <section className={card}>
          <p className="text-sm text-zinc-500">Your ride</p>
          <p className="text-xl font-semibold">{STATUS_TEXT[current.status]}</p>
          <p>
            {areaName(current.pickupAreaId)} → {areaName(current.dropoffAreaId)} · {current.seats} seat
            {current.seats > 1 && "s"}
          </p>
          <p>
            You pay <strong>{tk(current.farePaisa)}</strong> in cash
          </p>
          {current.driverName && (
            <p className="text-sm">
              Driver {current.driverName} · {current.vehicleName}
            </p>
          )}
          {current.otherPassengers > 0 && (
            <p className="text-sm">
              Sharing with {current.otherPassengers} other passenger{current.otherPassengers > 1 && "s"}
            </p>
          )}
          {CANCELLABLE.includes(current.status) && (
            <button onClick={() => cancel(current.id)} className="mt-3 rounded-md border border-zinc-300 px-4 py-2 dark:border-zinc-700">
              Cancel ride
            </button>
          )}
        </section>
      ) : (
        <BookingForm areas={areas} onBooked={refresh} />
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">History</h2>
        {history.length === 0 && <p className="text-sm text-zinc-500">No finished rides yet.</p>}
        {history.map((trip) => (
          <p key={trip.id} className="flex justify-between gap-2 text-sm">
            <span>
              {new Date(trip.createdAt).toLocaleDateString()} · {areaName(trip.pickupAreaId)} →{" "}
              {areaName(trip.dropoffAreaId)}
            </span>
            <span>
              {tk(trip.farePaisa)} · {STATUS_TEXT[trip.status]}
            </span>
          </p>
        ))}
      </section>
    </div>
  );
}

function BookingForm({ areas, onBooked }: { areas: Area[]; onBooked: () => void }) {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [seats, setSeats] = useState(1);
  // The quote remembers which choice it belongs to, so a slow answer never shows the wrong price
  const [quote, setQuote] = useState<{ for: string; data: Quote } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const res = await postJson("/requests", { pickupAreaId: pickup, dropoffAreaId: dropoff, seats });
    if (res.ok) onBooked();
    else setError(res.error.error);
  }

  const select = "rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700";

  return (
    <form onSubmit={submit} className={`${card} flex flex-col gap-3`}>
      <h2 className="font-semibold">Request a ride</h2>
      <label className="flex flex-col gap-1 text-sm">
        Pickup
        <select value={pickup} onChange={(e) => setPickup(e.target.value)} className={select} required>
          <option value="">Choose an area</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Drop-off
        <select value={dropoff} onChange={(e) => setDropoff(e.target.value)} className={select} required>
          <option value="">Choose an area</option>
          {areas
            .filter((a) => a.id !== pickup)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Seats
        <select value={seats} onChange={(e) => setSeats(Number(e.target.value))} className={select}>
          {[1, 2, 3].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>

      {ready && shown && (
        <dl className="grid grid-cols-2 gap-x-4 text-sm">
          <dt>Road distance</dt>
          <dd className="text-right">{km(shown.distanceM)}</dd>
          <dt>Base fare</dt>
          <dd className="text-right">{tk(shown.fare.baseFarePaisa)}</dd>
          <dt>Distance charge</dt>
          <dd className="text-right">{tk(shown.fare.distanceChargePaisa)}</dd>
          <dt>Pool discount (20%)</dt>
          <dd className="text-right">−{tk(shown.fare.poolDiscountPaisa)}</dd>
          <dt className="font-semibold">You pay (cash)</dt>
          <dd className="text-right font-semibold">{tk(shown.fare.farePaisa)}</dd>
        </dl>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={!ready} className={button}>
        Request ride
      </button>
    </form>
  );
}
