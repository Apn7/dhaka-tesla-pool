import type { ReactNode } from "react";

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-display font-bold tracking-tight text-brand ${className}`}>Tesla Pool</span>;
}

// Pickup dot, then a drop-off square per stop, joined by a road. The only place a route is drawn:
// the booking form, the passenger's ride card and the driver's stop list all use it.
// Each row draws the road above and below its own marker, so the line runs from the first
// marker to the last one whatever the row heights.
export function RouteLine({ from, to }: { from: ReactNode; to: ReactNode[] }) {
  const stops = [from, ...to];
  return (
    <ol>
      {stops.map((stop, i) => (
        <li key={i} className="flex gap-4">
          <div aria-hidden className="flex w-3 shrink-0 flex-col items-center">
            <span className={`w-0.5 flex-1 ${i > 0 ? "bg-line" : ""}`} />
            <span className={i === 0 ? "size-3 rounded-full border-[3px] border-ink bg-white" : "size-3 bg-brand"} />
            <span className={`w-0.5 flex-1 ${i < stops.length - 1 ? "bg-line" : ""}`} />
          </div>
          <div className="min-w-0 flex-1 py-1">{stop}</div>
        </li>
      ))}
    </ol>
  );
}
