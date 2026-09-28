"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { postJson, type ApiError, type User } from "@/lib/api";

// The seeded story cast, so an evaluator can log in with one tap
const DEMO_CAST = [
  { name: "Nusrat", email: "nusrat@teslapool.test" },
  { name: "Rafiq", email: "rafiq@teslapool.test" },
  { name: "Shirin", email: "shirin@teslapool.test" },
  { name: "Jashim (driver)", email: "jashim@teslapool.test" },
  { name: "Kamal (driver)", email: "kamal@teslapool.test" },
];
const DEMO_PASSWORD = "bullet123";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  async function send(body: unknown) {
    setPending(true);
    setError(null);
    const res = await postJson<{ user: User }>(`/auth/${mode}`, body);
    if (res.ok) {
      router.push("/");
      return;
    }
    setError(res.error);
    setPending(false);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send(Object.fromEntries(new FormData(e.currentTarget)));
  }

  const fieldError = (field: string) => error?.issues?.find((i) => i.field === field)?.message;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{mode === "login" ? "Log in" : "Create a passenger account"}</h1>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === "signup" && (
          <Field label="Name" name="name" autoComplete="name" maxLength={50} error={fieldError("name")} />
        )}
        <Field label="Email" name="email" type="email" autoComplete="email" error={fieldError("email")} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "signup" ? 8 : undefined}
          maxLength={200}
          error={fieldError("password")}
        />
        {error && !error.issues && <p className="text-sm text-red-600">{error.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>

      {mode === "login" && (
        <section className="flex flex-col gap-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Demo accounts (password <code>{DEMO_PASSWORD}</code>):
          </p>
          <div className="flex flex-wrap gap-2">
            {DEMO_CAST.map((person) => (
              <button
                key={person.email}
                type="button"
                disabled={pending}
                onClick={() => send({ email: person.email, password: DEMO_PASSWORD })}
                className="rounded-md border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-zinc-700"
              >
                {person.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="text-sm">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <Link href={mode === "login" ? "/signup" : "/login"} className="underline">
          {mode === "login" ? "Create an account" : "Log in"}
        </Link>
      </p>
    </main>
  );
}

function Field({
  label,
  error,
  ...input
}: { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        required
        className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base dark:border-zinc-700"
        {...input}
      />
      {error && <span className="text-red-600">{error}</span>}
    </label>
  );
}
