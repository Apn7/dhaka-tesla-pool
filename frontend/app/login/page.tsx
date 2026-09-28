import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Log in · Dhaka Tesla Pool" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
