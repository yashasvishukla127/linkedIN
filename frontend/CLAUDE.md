@AGENTS.md
# frontend/CLAUDE.md

Stack: Next.js App Router, TypeScript, Tailwind, @supabase/supabase-js.

Auth: Supabase Auth (email/password). Session via supabase.auth.getSession().
All calls to the FastAPI backend must include:
  Authorization: Bearer <session.access_token>

Backend base URL: process.env.NEXT_PUBLIC_API_BASE

Backend endpoints (all require the Bearer header above):
- POST /connections/{other_user_id}/request -> {status: "PENDING"|"ACCEPTED"} or 409
- PATCH /connections/{other_user_id}/accept -> {status: "ACCEPTED"} or 409
- GET /connections -> [{id, other_user_id, updated_at}]  (accepted only)
- GET /connections/pending -> [{id, requester_id, other_user_id, status, direction: "incoming"|"outgoing"}]
- POST /messages/{other_user_id} {content: string} -> {id, created_at} or 403 if not connected

Supabase tables readable directly by the client (RLS already enforces "own rows only"):
- profiles (user_id, name, headline, bio, avatar_url, background_url) — all authenticated users can read all profiles
- connections, messages — readable only where the current user is a participant

Realtime: subscribe to postgres_changes on `messages` filtered to the open conversation; INSERT-only events matter for v1.

Convention: one Supabase client instance (lib/supabaseClient.ts), one API helper (lib/api.ts) that attaches the Bearer token — every feature uses these two, don't create new fetch wrappers.