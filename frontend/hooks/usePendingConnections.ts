"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import {
  ApiError,
  acceptConnectionRequest,
  cancelConnectionRequest,
  listPendingConnections,
  type PendingConnection,
} from "@/lib/api";

export type ConnectionProfile = {
  user_id: string;
  name: string;
  headline: string | null;
  avatar_url: string | null;
};

type AcceptStatus = "idle" | "accepting" | "error";

/**
 * Shared data source for pending connection requests: fetches
 * /connections/pending plus the requesters' profiles, and exposes an
 * accept action. Used by both the /requests page and the navbar's
 * network dropdown so they never drift out of sync.
 */
export function usePendingConnections() {
  const { session } = useAuth();
  const [requests, setRequests] = useState<PendingConnection[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ConnectionProfile>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acceptStatuses, setAcceptStatuses] = useState<
    Record<string, AcceptStatus>
  >({});
  const [cancelStatuses, setCancelStatuses] = useState<
    Record<string, AcceptStatus>
  >({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const silentRefreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!session?.user.id) return;
    let cancelled = false;

    async function load(silent: boolean) {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const pending = await listPendingConnections();
        if (cancelled) return;
        setRequests(pending);

        const ids = Array.from(new Set(pending.map((r) => r.other_user_id)));
        if (ids.length > 0) {
          const { data, error } = await supabase
            .from("profiles")
            .select("user_id, name, headline, avatar_url")
            .in("user_id", ids);
          if (cancelled) return;
          if (error) {
            setLoadError(error.message);
          } else {
            const byId: Record<string, ConnectionProfile> = {};
            for (const p of data ?? []) byId[p.user_id] = p;
            setProfiles(byId);
          }
        } else {
          setProfiles({});
        }
      } catch (err) {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    }

    load(false);
    const refresh = () => load(true);
    silentRefreshRef.current = refresh;
    const interval = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("connections:changed", refresh);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("connections:changed", refresh);
    };
  }, [session?.user.id]);

  async function handleAccept(otherUserId: string) {
    setAcceptStatuses((p) => ({ ...p, [otherUserId]: "accepting" }));
    setErrors((p) => {
      const n = { ...p };
      delete n[otherUserId];
      return n;
    });
    try {
      await acceptConnectionRequest(otherUserId);
      setRequests((p) => p.filter((r) => r.other_user_id !== otherUserId));
    } catch (err) {
      setAcceptStatuses((p) => ({ ...p, [otherUserId]: "error" }));
      setErrors((p) => ({
        ...p,
        [otherUserId]: err instanceof Error ? err.message : "Something went wrong",
      }));
    }
  }

  async function handleCancel(otherUserId: string) {
    setCancelStatuses((p) => ({ ...p, [otherUserId]: "accepting" }));
    setErrors((p) => {
      const n = { ...p };
      delete n[otherUserId];
      return n;
    });
    try {
      await cancelConnectionRequest(otherUserId);
      setRequests((p) => p.filter((r) => r.other_user_id !== otherUserId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        silentRefreshRef.current();
        setCancelStatuses((p) => ({ ...p, [otherUserId]: "idle" }));
        return;
      }
      setCancelStatuses((p) => ({ ...p, [otherUserId]: "error" }));
      setErrors((p) => ({
        ...p,
        [otherUserId]: err instanceof Error ? err.message : "Something went wrong",
      }));
    }
  }

  const incoming = requests.filter((r) => r.direction === "incoming");
  const sent = requests.filter((r) => r.direction === "outgoing");

  return {
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
  };
}
