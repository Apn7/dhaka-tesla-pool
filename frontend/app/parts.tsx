import type { ReactNode } from "react";

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-display font-bold tracking-tight text-brand ${className}`}>Tesla Pool</span>;
}

// Pickup dot, drop-off square, joined by a road: used by the booking form and the ride card
export function RouteLine({ from, to }: { from: ReactNode; to: ReactNode }) {
  return (
    <div className="relative flex flex-col gap-2">
      <span aria-hidden className="absolute top-1/4 bottom-1/4 left-[5px] w-0.5 bg-line" />
      <div className="flex items-center gap-4">
        <span aria-hidden className="relative size-3 shrink-0 rounded-full border-[3px] border-ink bg-white" />
        <div className="min-w-0 flex-1">{from}</div>
      </div>
      <div className="flex items-center gap-4">
        <span aria-hidden className="relative size-3 shrink-0 bg-brand" />
        <div className="min-w-0 flex-1">{to}</div>
      </div>
    </div>
  );
}
