"use client";

import { useSyncExternalStore } from "react";
import { isWaking, subscribeWaking } from "@/lib/api";

// Shown while an API call waits for the sleeping free backend (see lib/api.ts)
export function WakingNotice() {
  const waking = useSyncExternalStore(subscribeWaking, isWaking, () => false);
  return (
    <div role="status" className="fixed inset-x-0 bottom-0">
      {waking && (
        <p className="bg-signal px-5 py-3 text-center text-sm font-medium text-ink">
          Waking up the free server. This can take up to a minute.
        </p>
      )}
    </div>
  );
}
