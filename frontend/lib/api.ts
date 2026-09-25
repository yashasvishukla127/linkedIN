// frontend/lib/api.ts
import { supabase } from "@/lib/supabaseClient";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new ApiError(401, "Not signed in");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.detail ?? res.statusText;
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return null;
  return res.json();
}

export type Connection = {
  id: string;
  other_user_id: string;
  updated_at: string;
};

export type PendingConnection = {
  id: string;
  requester_id: string;
  other_user_id: string;
  status: string;
  direction: "incoming" | "outgoing";
};

export type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
};

export function sendMessage(
  otherUserId: string,
  content: string,
): Promise<{ id: string; created_at: string }> {
  return apiFetch(`/messages/${otherUserId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export async function sendConnectionRequest(otherUserId: string) {
  const result = await apiFetch(`/connections/${otherUserId}/request`, {
    method: "POST",
  });
  window.dispatchEvent(new Event("connections:changed"));
  return result;
}

export async function cancelConnectionRequest(otherUserId: string) {
  const result = await apiFetch(`/connections/${otherUserId}/request`, {
    method: "DELETE",
  });
  window.dispatchEvent(new Event("connections:changed"));
  return result;
}

export async function acceptConnectionRequest(otherUserId: string) {
  const result = await apiFetch(`/connections/${otherUserId}/accept`, {
    method: "PATCH",
  });
  window.dispatchEvent(new Event("connections:changed"));
  return result;
}

export function listConnections(): Promise<Connection[]> {
  return apiFetch("/connections");
}

export function listPendingConnections(): Promise<PendingConnection[]> {
  return apiFetch("/connections/pending");
}

export function getUnreadMessageCount(): Promise<{ count: number }> {
  return apiFetch("/messages/unread-count");
}

export function markMessagesRead(otherUserId: string): Promise<{ status: string }> {
  return apiFetch(`/messages/${otherUserId}/read`, { method: "PATCH" });
}

export type Conversation = {
  other_user_id: string;
  last_message: string | null;
  last_message_at: string | null;
  has_unread: boolean;
};

export function listConversations(): Promise<Conversation[]> {
  return apiFetch("/messages/conversations");
}
