"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getJson, postJson, type User } from "@/lib/api";
import { ui } from "@/lib/ui";
import { Wordmark } from "./parts";
import { PassengerView } from "./passenger";

export default function Home() {
  // undefined = still asking the API, null = not logged in
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    getJson<{ user: User }>("/auth/me").then((res) => setUser(res.ok ? res.data.user : null));
  }, []);

  async function logout() {
    await postJson("/auth/logout");
    setUser(null);
  }

  if (user) {
    return (
      <>
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
            <Wordmark className="text-2xl" />
            <div className="flex items-center gap-4 text-sm">
              <span>
                {user.name}
                <span className="text-muted"> ({user.role === "DRIVER" ? "driver" : "passenger"})</span>
              </span>
              <button onClick={logout} className="font-medium underline">
                Log out
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
          {user.role === "PASSENGER" ? <PassengerView /> : <p className="text-muted">The driver screen comes next.</p>}
        </main>
      </>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-10">
      <div className="flex flex-col gap-3">
        <Wordmark className="text-6xl leading-none" />
        <p className="font-display text-2xl leading-tight font-semibold">
          Share a seat. Split the fare. Survive Dhaka traffic.
        </p>
        <p className="text-muted">
          Pool a three-seat rickshaw with people going your way across 12 Dhaka areas. Everyone pays their own fare,
          in cash, 20% off.
        </p>
      </div>

      {user === undefined && <p className="text-sm text-muted">Loading…</p>}

      {user === null && (
        <div className="flex flex-col gap-3">
          <Link href="/login" className={`${ui.primary} text-center`}>
            Log in
          </Link>
          <Link href="/signup" className={`${ui.secondary} text-center`}>
            Create an account
          </Link>
        </div>
      )}
    </main>
  );
}
