"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { ApiError, sendConnectionRequest } from "@/lib/api";

type Profile = {
  user_id: string;
  name: string;
  headline: string | null;
  avatar_url: string | null;
};

type ConnectStatus = "idle" | "sending" | "pending" | "connected" | "error";

export default function PeoplePage() {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ConnectStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadProfiles() {
      setLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, name, headline, avatar_url")
        .neq("user_id", session?.user.id)
        .order("name");

      if (cancelled) return;

      if (error) {
        setLoadError(error.message);
      } else {
        setProfiles(data ?? []);
      }
      setLoading(false);
    }

    if (session?.user.id) {
      loadProfiles();
    }

    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  async function handleConnect(otherUserId: string) {
    setStatuses((prev) => ({ ...prev, [otherUserId]: "sending" }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[otherUserId];
      return next;
    });

    try {
      await sendConnectionRequest(otherUserId);
      setStatuses((prev) => ({ ...prev, [otherUserId]: "pending" }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const already =
          /connected/i.test(err.message) ? "connected" : "pending";
        setStatuses((prev) => ({ ...prev, [otherUserId]: already }));
        return;
      }

      setStatuses((prev) => ({ ...prev, [otherUserId]: "error" }));
      setErrors((prev) => ({
        ...prev,
        [otherUserId]:
          err instanceof Error ? err.message : "Something went wrong",
      }));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        People
      </h1>

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {loadError}
        </p>
      ) : profiles.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No one else has joined yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {profiles.map((profile) => {
            const status = statuses[profile.user_id] ?? "idle";
            return (
              <li
                key={profile.user_id}
                className="flex flex-col items-stretch gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
                      {profile.name}
                    </p>
                    {profile.headline ? (
                      <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                        {profile.headline}
                      </p>
                    ) : null}
                    {status === "error" && errors[profile.user_id] ? (
                      <p
                        className="mt-1 text-xs text-red-600 dark:text-red-400"
                        role="alert"
                      >
                        {errors[profile.user_id]}
                      </p>
                    ) : null}
                  </div>
                </div>

                <ConnectButton
                  status={status}
                  onClick={() => handleConnect(profile.user_id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ConnectButton({
  status,
  onClick,
}: {
  status: ConnectStatus;
  onClick: () => void;
}) {
  if (status === "pending") {
    return (
      <span className="w-full shrink-0 rounded-full border border-zinc-200 px-4 py-1.5 text-center text-sm font-medium text-zinc-500 sm:w-auto dark:border-zinc-800 dark:text-zinc-400">
        Request pending
      </span>
    );
  }

  if (status === "connected") {
    return (
      <span className="w-full shrink-0 rounded-full border border-zinc-200 px-4 py-1.5 text-center text-sm font-medium text-zinc-500 sm:w-auto dark:border-zinc-800 dark:text-zinc-400">
        Connected
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={status === "sending"}
      onClick={onClick}
      className="w-full shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
    >
      {status === "sending"
        ? "Sending…"
        : status === "error"
          ? "Retry"
          : "Connect"}
    </button>
  );
}
