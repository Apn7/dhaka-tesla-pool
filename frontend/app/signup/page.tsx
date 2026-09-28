import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign up · Dhaka Tesla Pool" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
