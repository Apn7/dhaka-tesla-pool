"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getJson, postJson, type User } from "@/lib/api";

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

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">Dhaka Tesla Pool</h1>
      <p className="text-zinc-600 dark:text-zinc-400">Share a seat. Split the fare. Survive Dhaka traffic.</p>

      {user === undefined && <p className="text-sm text-zinc-500">Loading…</p>}

      {user && (
        <>
          <p>
            Hi {user.name} <span className="text-zinc-500">({user.role === "DRIVER" ? "driver" : "passenger"})</span>
          </p>
          <button onClick={logout} className="rounded-md border border-zinc-300 px-4 py-2 dark:border-zinc-700">
            Log out
          </button>
        </>
      )}

      {user === null && (
        <div className="flex gap-3">
          <Link href="/login" className="rounded-md bg-red-600 px-4 py-2 font-medium text-white">
            Log in
          </Link>
          <Link href="/signup" className="rounded-md border border-zinc-300 px-4 py-2 dark:border-zinc-700">
            Sign up
          </Link>
        </div>
      )}
    </main>
  );
}
