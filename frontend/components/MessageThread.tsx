"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { sendMessage, type Message } from "@/lib/api";
import { useMessageInserts } from "@/hooks/useMessageInserts";

const MESSAGE_COLUMNS = "id, sender_id, receiver_id, content, created_at";

export default function MessageThread({
  otherUserId,
}: {
  otherUserId: string;
}) {
  const { session } = useAuth();
  const me = session?.user.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
    });
  }, []);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .or(
          `and(sender_id.eq.${me},receiver_id.eq.${otherUserId}),` +
            `and(sender_id.eq.${otherUserId},receiver_id.eq.${me})`,
        )
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        setLoadError(error.message);
      } else {
        setMessages(data ?? []);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [me, otherUserId]);

  const insertFilters = useMemo(
    () =>
      me
        ? [
            {
              filter: `sender_id=eq.${me}`,
              onInsert: (row: Message) => {
                if (row.receiver_id === otherUserId) addMessage(row);
              },
            },
            {
              filter: `receiver_id=eq.${me}`,
              onInsert: (row: Message) => {
                if (row.sender_id === otherUserId) addMessage(row);
              },
            },
          ]
        : [],
    [me, otherUserId, addMessage],
  );

  useMessageInserts(me ? `messages:${me}:${otherUserId}` : null, insertFilters);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !me || sending) return;

    setSending(true);
    setSendError(null);

    try {
      const { id, created_at } = await sendMessage(otherUserId, content);
      setDraft("");
      addMessage({
        id,
        sender_id: me,
        receiver_id: otherUserId,
        content,
        created_at,
      });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : loadError ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {loadError}
          </p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              mine={message.sender_id === me}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            placeholder="Write a message…"
            className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={sending || draft.trim().length === 0}
            className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {sendError ? (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {sendError}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
}: {
  message: Message;
  mine: boolean;
}) {
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          mine
            ? "max-w-[75%] rounded-2xl bg-foreground px-4 py-2 text-sm text-background"
            : "max-w-[75%] rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
        }
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  );
}
