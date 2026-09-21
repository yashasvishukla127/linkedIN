"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { ApiError, acceptConnectionRequest, listPendingConnections } from "@/lib/api";

type PendingConnection = {
  id: string;
  requester_id: string;
  other_user_id: string;
  status: string;
  direction: "incoming" | "outgoing";
};

type Profile = {
  user_id: string;
  name: string;
  headline: string | null;
  avatar_url: string | null;
};

type AcceptStatus = "idle" | "accepting" | "error";

export default function RequestsPage() {
  const { session } = useAuth();
  const [requests, setRequests] = useState<PendingConnection[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acceptStatuses, setAcceptStatuses] = useState<
    Record<string, AcceptStatus>
  >({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const pending: PendingConnection[] = await listPendingConnections();
        if (cancelled) return;

        setRequests(pending);

        const otherUserIds = Array.from(
          new Set(pending.map((r) => r.other_user_id)),
        );

        if (otherUserIds.length > 0) {
          const { data, error } = await supabase
            .from("profiles")
            .select("user_id, name, headline, avatar_url")
            .in("user_id", otherUserIds);

          if (cancelled) return;

          if (error) {
            setLoadError(error.message);
          } else {
            const byId: Record<string, Profile> = {};
            for (const profile of data ?? []) {
              byId[profile.user_id] = profile;
            }
            setProfiles(byId);
          }
        }
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

  async function handleAccept(otherUserId: string) {
    setAcceptStatuses((prev) => ({ ...prev, [otherUserId]: "accepting" }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[otherUserId];
      return next;
    });

    try {
      await acceptConnectionRequest(otherUserId);
      setRequests((prev) => prev.filter((r) => r.other_user_id !== otherUserId));
    } catch (err) {
      setAcceptStatuses((prev) => ({ ...prev, [otherUserId]: "error" }));
      setErrors((prev) => ({
        ...prev,
        [otherUserId]:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Something went wrong",
      }));
    }
  }

  const incoming = requests.filter((r) => r.direction === "incoming");
  const outgoing = requests.filter((r) => r.direction === "outgoing");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Requests
      </h1>

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {loadError}
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Incoming
            </h2>
            {incoming.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No incoming requests.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {incoming.map((request) => {
                  const profile = profiles[request.other_user_id];
                  const status =
                    acceptStatuses[request.other_user_id] ?? "idle";
                  return (
                    <li
                      key={request.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <RequestProfile profile={profile} />
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <button
                          type="button"
                          disabled={status === "accepting"}
                          onClick={() => handleAccept(request.other_user_id)}
                          className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {status === "accepting"
                            ? "Accepting…"
                            : status === "error"
                              ? "Retry"
                              : "Accept"}
                        </button>
                        {status === "error" &&
                        errors[request.other_user_id] ? (
                          <p
                            className="text-xs text-red-600 dark:text-red-400"
                            role="alert"
                          >
                            {errors[request.other_user_id]}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Outgoing
            </h2>
            {outgoing.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No outgoing requests.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {outgoing.map((request) => {
                  const profile = profiles[request.other_user_id];
                  return (
                    <li
                      key={request.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <RequestProfile profile={profile} />
                      <span className="shrink-0 rounded-full border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                        Requested
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function RequestProfile({ profile }: { profile: Profile | undefined }) {
  return (
    <div className="flex items-center gap-3">
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt=""
          className="h-10 w-10 rounded-full object-cover"
        />
      ) : (
        <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800" />
      )}
      <div>
        <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          {profile?.name ?? "Unknown user"}
        </p>
        {profile?.headline ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {profile.headline}
          </p>
        ) : null}
      </div>
    </div>
  );
}
