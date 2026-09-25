"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { markMessagesRead } from "@/lib/api";
import MessageThread from "@/components/MessageThread";

type Profile = {
  user_id: string;
  name: string;
  headline: string | null;
  avatar_url: string | null;
};

export default function MessagesPage() {
  const params = useParams<{ otherUserId: string }>();
  const otherUserId = params.otherUserId;
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("profiles")
      .select("user_id, name, headline, avatar_url")
      .eq("user_id", otherUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile(data);
      });

    return () => {
      cancelled = true;
    };
  }, [otherUserId]);

  useEffect(() => {
    if (!otherUserId) return;

    markMessagesRead(otherUserId)
      .then(() => window.dispatchEvent(new Event("messages:read")))
      .catch(() => {});
  }, [otherUserId]);

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16">
      <header className="flex items-center gap-3">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {profile?.name ?? "Unknown user"}
          </h1>
          {profile?.headline ? (
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
              {profile.headline}
            </p>
          ) : null}
        </div>
        <Link
          href="/people"
          className="shrink-0 text-sm text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Back
        </Link>
      </header>

      <MessageThread otherUserId={otherUserId} />
    </div>
  );
}
