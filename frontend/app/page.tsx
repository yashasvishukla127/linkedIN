"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import RequestsPanel from "@/components/RequestsPanel";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const { session } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8 sm:py-16">
      <header className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Zorro-x
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {session?.user.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/people"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Find people
          </Link>
          <Link
            href="/profile"
            className="inline-flex min-h-11 items-center justify-center"
          >
            Profile
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Sign out
          </button>
        </div>
      </header>

      <RequestsPanel />
    </div>
  );
}
