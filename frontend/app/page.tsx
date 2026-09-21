"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const { session } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Signed in
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {session?.user.email}
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/people"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Find people
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
