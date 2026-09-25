"use client";

import { usePendingConnections, type ConnectionProfile } from "@/hooks/usePendingConnections";

const cardClass =
  "flex flex-col items-stretch gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-950";

export default function RequestsPanel() {
  const {
    incoming,
    sent,
    profiles,
    loading,
    loadError,
    acceptStatuses,
    cancelStatuses,
    errors,
    handleAccept,
    handleCancel,
  } = usePendingConnections();

  if (loading)
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;
  if (loadError)
    return (
      <p className="text-sm text-red-600 dark:text-red-400" role="alert">
        {loadError}
      </p>
    );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Pending requests ({incoming.length})
        </h2>
        {incoming.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No pending requests.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {incoming.map((r) => {
              const status = acceptStatuses[r.other_user_id] ?? "idle";
              return (
                <li key={r.id} className={cardClass}>
                  <RequestProfile profile={profiles[r.other_user_id]} />
                  <div className="flex w-full shrink-0 flex-col items-stretch gap-1 sm:w-auto sm:items-end">
                    <button
                      type="button"
                      disabled={status === "accepting"}
                      onClick={() => handleAccept(r.other_user_id)}
                      className="w-full rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
                    >
                      {status === "accepting"
                        ? "Accepting…"
                        : status === "error"
                          ? "Retry"
                          : "Accept"}
                    </button>
                    {status === "error" && errors[r.other_user_id] ? (
                      <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                        {errors[r.other_user_id]}
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
          Sent requests ({sent.length})
        </h2>
        {sent.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            You haven&apos;t sent any requests.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sent.map((r) => {
              const status = cancelStatuses[r.other_user_id] ?? "idle";
              return (
                <li key={r.id} className={cardClass}>
                  <RequestProfile profile={profiles[r.other_user_id]} />
                  <div className="flex w-full shrink-0 flex-col items-stretch gap-1 sm:w-auto sm:items-end">
                    <button
                      type="button"
                      disabled={status === "accepting"}
                      onClick={() => handleCancel(r.other_user_id)}
                      className="w-full rounded-full border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-950 transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto dark:border-zinc-800 dark:text-zinc-50"
                    >
                      {status === "accepting"
                        ? "Cancelling…"
                        : status === "error"
                          ? "Retry"
                          : "Cancel"}
                    </button>
                    {status === "error" && errors[r.other_user_id] ? (
                      <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                        {errors[r.other_user_id]}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function RequestProfile({ profile }: { profile: ConnectionProfile | undefined }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800" />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
          {profile?.name ?? "Unknown user"}
        </p>
        {profile?.headline ? (
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{profile.headline}</p>
        ) : null}
      </div>
    </div>
  );
}
