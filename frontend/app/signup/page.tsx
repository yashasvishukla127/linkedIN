"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthField, AuthForm } from "@/components/AuthForm";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    setPending(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      router.replace("/");
      return;
    }

    setInfo("Check your email to confirm your account, then log in.");
  }

  return (
    <AuthForm
      title="Sign up"
      subtitle="Create an account with email and password."
      error={error}
      pending={pending}
      submitLabel="Create account"
      onSubmit={handleSubmit}
      footerHref="/login"
      footerPrompt="Already have an account?"
      footerLabel="Log in"
    >
      <AuthField
        id="name"
        label="Name"
        type="text"
        value={name}
        autoComplete="name"
        onChange={setName}
      />
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
        autoComplete="new-password"
        onChange={setPassword}
      />
      {info ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
          {info}
        </p>
      ) : null}
    </AuthForm>
  );
}
