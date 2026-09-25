"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { listConversations, type Conversation } from "@/lib/api";
import { useMessageInserts } from "@/hooks/useMessageInserts";

type Profile = {
  user_id: string;
  name: string;
  avatar_url: string | null;
};

type ConversationRow = Conversation & {
  profile: Profile | null;
};

export default function MessagesPage() {
  const { session } = useAuth();
  const me = session?.user.id;

  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);

    try {
      const conversations = await listConversations();

      const otherUserIds = conversations.map((c) => c.other_user_id);
      const profileByUserId = new Map<string, Profile>();

      if (otherUserIds.length > 0) {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, name, avatar_url")
          .in("user_id", otherUserIds);

        if (error) throw error;

        for (const profile of data ?? []) {
          profileByUserId.set(profile.user_id, profile);
        }
      }

      setRows(
        conversations.map((c) => ({
          ...c,
          profile: profileByUserId.get(c.other_user_id) ?? null,
        })),
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const insertFilters = useMemo(
    () =>
      me
        ? [
            {
              filter: `receiver_id=eq.${me}`,
              onInsert: () => {
                load();
                window.dispatchEvent(new Event("messages:received"));
              },
            },
          ]
        : [],
    [me, load],
  );

  useMessageInserts(me ? `messages-list:${me}` : null, insertFilters);

  function handleRowClick(otherUserId: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.other_user_id === otherUserId ? { ...row, has_unread: false } : row,
      ),
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Messages
      </h1>

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {loadError}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No conversations yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.other_user_id}>
              <Link
                href={`/messages/${row.other_user_id}`}
                onClick={() => handleRowClick(row.other_user_id)}
                className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              >
                {row.profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.profile.avatar_url}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800" />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm text-zinc-950 dark:text-zinc-50 ${
                      row.has_unread ? "font-bold" : "font-normal"
                    }`}
                  >
                    {row.profile?.name ?? "Unknown user"}
                  </p>
                  <p
                    className={`truncate text-sm text-zinc-500 dark:text-zinc-400 ${
                      row.has_unread ? "font-bold" : "font-normal"
                    }`}
                  >
                    {row.last_message ?? ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
