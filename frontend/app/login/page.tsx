"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthField, AuthForm } from "@/components/AuthForm";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setPending(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/");
  }

  return (
    <AuthForm
      title="Log in"
      subtitle="Sign in with your email and password."
      error={error}
      pending={pending}
      submitLabel="Log in"
      onSubmit={handleSubmit}
      footerHref="/signup"
      footerPrompt="Need an account?"
      footerLabel="Sign up"
    >
      <AuthField
        id="email"
        label="Email"
        type="email"
        value={email}
        autoComplete="email"
        onChange={setEmail}
      />
      <AuthField
        id="password"
        label="Password"
        type="password"
        value={password}
        autoComplete="current-password"
        onChange={setPassword}
      />
    </AuthForm>
  );
}
