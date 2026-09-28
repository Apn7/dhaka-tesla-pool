"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { postJson, type ApiError, type User } from "@/lib/api";
import { ui } from "@/lib/ui";
import { Wordmark } from "./parts";

// The seeded story cast, so an evaluator can log in with one tap
const DEMO_CAST = [
  { name: "Nusrat", email: "nusrat@teslapool.test" },
  { name: "Rafiq", email: "rafiq@teslapool.test" },
  { name: "Shirin", email: "shirin@teslapool.test" },
  { name: "Jashim", email: "jashim@teslapool.test", driver: true },
  { name: "Kamal", email: "kamal@teslapool.test", driver: true },
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-5 py-10">
      <Link href="/">
        <Wordmark className="text-4xl" />
      </Link>

      <div className={`${ui.panel} flex flex-col gap-5`}>
        <h1 className={ui.heading}>{mode === "login" ? "Log in" : "Create a passenger account"}</h1>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === "signup" && (
            <Field label="Your name" name="name" autoComplete="name" maxLength={50} error={fieldError("name")} />
          )}
          <Field label="Email" name="email" type="email" autoComplete="email" error={fieldError("email")} />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 8 : undefined}
            maxLength={200}
            hint={mode === "signup" ? "At least 8 characters" : undefined}
            error={fieldError("password")}
          />
          {error && !error.issues && (
            <p role="alert" className="text-sm text-brand">
              {error.error}
            </p>
          )}
          <button type="submit" disabled={pending} className={ui.primary}>
            {pending ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <p className="text-sm text-muted">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <Link href={mode === "login" ? "/signup" : "/login"} className="font-medium text-ink underline">
            {mode === "login" ? "Create an account" : "Log in"}
          </Link>
        </p>
      </div>

      {mode === "login" && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Or try the demo cast. Every password is <code className="text-ink">{DEMO_PASSWORD}</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            {DEMO_CAST.map((person) => (
              <button
                key={person.email}
                type="button"
                disabled={pending}
                onClick={() => send({ email: person.email, password: DEMO_PASSWORD })}
                className="rounded-full border border-line bg-white px-4 py-2 text-sm hover:border-ink disabled:opacity-40"
              >
                {person.name}
                {person.driver && <span className="text-muted"> (driver)</span>}
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Field({
  label,
  hint,
  error,
  ...input
}: { label: string; hint?: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <input required className={ui.field} {...input} />
      {error ? (
        <span className="font-normal text-brand">{error}</span>
      ) : (
        hint && <span className="font-normal text-muted">{hint}</span>
      )}
    </label>
  );
}
