"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import {
  ApiError,
  acceptConnectionRequest,
  cancelConnectionRequest,
  listConnections,
  listPendingConnections,
  sendConnectionRequest,
  type Connection,
  type PendingConnection,
} from "@/lib/api";

type Profile = {
  user_id: string;
  name: string;
  headline: string | null;
  avatar_url: string | null;
};

type ConnectStatus =
  | "idle"
  | "sending"
  | "sent"
  | "cancelling"
  | "incoming"
  | "accepting"
  | "connected"
  | "error";

function statusMapFromLists(
  connections: Connection[],
  pending: PendingConnection[],
): Record<string, ConnectStatus> {
  const next: Record<string, ConnectStatus> = {};

  for (const row of pending) {
    next[row.other_user_id] =
      row.direction === "incoming" ? "incoming" : "sent";
  }

  for (const row of connections) {
    next[row.other_user_id] = "connected";
  }

  return next;
}

export default function PeoplePage() {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ConnectStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const [profilesResult, connections, pending] = await Promise.all([
          supabase
            .from("profiles")
            .select("user_id, name, headline, avatar_url")
            .neq("user_id", session?.user.id)
            .order("name"),
          listConnections(),
          listPendingConnections(),
        ]);

        if (cancelled) return;

        if (profilesResult.error) {
          setLoadError(profilesResult.error.message);
          return;
        }

        setProfiles(profilesResult.data ?? []);
        setStatuses(statusMapFromLists(connections, pending));
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Something went wrong",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (session?.user.id) {
      load();
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
      setStatuses((prev) => ({ ...prev, [otherUserId]: "sent" }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const already = /connected/i.test(err.message) ? "connected" : "sent";
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

  async function refreshStatusFor(otherUserId: string) {
    try {
      const [connections, pending] = await Promise.all([
        listConnections(),
        listPendingConnections(),
      ]);
      const map = statusMapFromLists(connections, pending);
      setStatuses((prev) => ({
        ...prev,
        [otherUserId]: map[otherUserId] ?? "idle",
      }));
    } catch {
      setStatuses((prev) => ({ ...prev, [otherUserId]: "idle" }));
    }
  }

  async function handleCancel(otherUserId: string) {
    setStatuses((prev) => ({ ...prev, [otherUserId]: "cancelling" }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[otherUserId];
      return next;
    });

    try {
      await cancelConnectionRequest(otherUserId);
      setStatuses((prev) => ({ ...prev, [otherUserId]: "idle" }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        await refreshStatusFor(otherUserId);
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

  async function handleAccept(otherUserId: string) {
    setStatuses((prev) => ({ ...prev, [otherUserId]: "accepting" }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[otherUserId];
      return next;
    });

    try {
      await acceptConnectionRequest(otherUserId);
      setStatuses((prev) => ({ ...prev, [otherUserId]: "connected" }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setStatuses((prev) => ({ ...prev, [otherUserId]: "connected" }));
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
                  otherUserId={profile.user_id}
                  status={status}
                  onConnect={() => handleConnect(profile.user_id)}
                  onAccept={() => handleAccept(profile.user_id)}
                  onCancel={() => handleCancel(profile.user_id)}
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
  otherUserId,
  status,
  onConnect,
  onAccept,
  onCancel,
}: {
  otherUserId: string;
  status: ConnectStatus;
  onConnect: () => void;
  onAccept: () => void;
  onCancel: () => void;
}) {
  if (status === "sent" || status === "cancelling") {
    return (
      <button
        type="button"
        disabled={status === "cancelling"}
        onClick={onCancel}
        className="w-full shrink-0 rounded-full border border-zinc-200 px-4 py-1.5 text-center text-sm font-medium text-zinc-950 transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto dark:border-zinc-800 dark:text-zinc-50"
      >
        {status === "cancelling" ? "Cancelling…" : "Cancel Request"}
      </button>
    );
  }

  if (status === "incoming" || status === "accepting") {
    return (
      <button
        type="button"
        disabled={status === "accepting"}
        onClick={onAccept}
        className="w-full shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
      >
        {status === "accepting" ? "Accepting…" : "Accept"}
      </button>
    );
  }

  if (status === "connected") {
    return (
      <Link
        href={`/messages/${otherUserId}`}
        className="w-full shrink-0 rounded-full border border-zinc-200 px-4 py-1.5 text-center text-sm font-medium text-zinc-950 sm:w-auto dark:border-zinc-800 dark:text-zinc-50"
      >
        Message
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={status === "sending"}
      onClick={onConnect}
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
