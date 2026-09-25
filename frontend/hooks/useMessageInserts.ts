"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Message } from "@/lib/api";

type MessageInsertFilter = {
  filter: string;
  onInsert: (message: Message) => void;
};

/**
 * Subscribes to INSERT events on the `messages` table, one Postgres filter
 * per entry in `filters`, sharing a single Realtime channel. Callbacks are
 * read from a ref so passing new function identities each render doesn't
 * resubscribe the channel — only a change to `channelName` or the filter
 * strings themselves does.
 */
export function useMessageInserts(
  channelName: string | null,
  filters: MessageInsertFilter[],
) {
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const filterKey = filters.map((f) => f.filter).join("|");

  useEffect(() => {
    if (!channelName || filtersRef.current.length === 0) return;

    let channel = supabase.channel(channelName);

    filtersRef.current.forEach(({ filter }, index) => {
      channel = channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter },
        (payload) => filtersRef.current[index]?.onInsert(payload.new as Message),
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, filterKey]);
}
