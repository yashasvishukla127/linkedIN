# Supabase Setup — Step-by-Step Runbook

This is **Phase 1 / Step 2** of your MVP build order (from `connection-app-mvp-architecture.md`). Nothing here touches FastAPI — this is pure Supabase dashboard + SQL editor work. Don't start FastAPI scaffolding until step 7 below passes.

One correction from the last schema: Supabase's `auth.users.id` is `uuid`, not `bigint`. All tables below use `uuid` to match — this replaces the `BIGINT` types in the earlier state-machine doc.

---

## Step 1 — Create project + enable Auth (dashboard, ~10 min)

1. supabase.com → New project → note the project URL and `anon` key (frontend) and `service_role` key (FastAPI only — **never ship this to the client**).
2. Authentication → Providers → enable Email (add Google/GitHub later if you want social login; not needed for MVP).
3. Authentication → URL Configuration → set your Lovable app's dev/prod URLs for redirect handling.

Do this now, nothing to implement yet.

---

## Step 2 — `profiles` table (SQL editor)

```sql
create table public.profiles (
    user_id        uuid primary key references auth.users(id) on delete cascade,
    name           text not null,
    headline       text,
    bio            text,
    avatar_url     text,
    background_url text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
```

Auto-create a profile row whenever someone signs up, so you never have a `users` row without a matching `profiles` row:

```sql
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'New User'));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
```

## Step 3 — `connections` table (SQL editor)

```sql
create table public.connections (
    id           uuid primary key default gen_random_uuid(),
    user_id_a    uuid not null references auth.users(id),
    user_id_b    uuid not null references auth.users(id),
    requester_id uuid not null references auth.users(id),
    status       text not null check (status in ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),

    constraint chk_order      check (user_id_a < user_id_b),
    constraint chk_requester  check (requester_id in (user_id_a, user_id_b)),
    constraint uq_pair        unique (user_id_a, user_id_b)
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_connections_updated_at
before update on public.connections
for each row execute function public.set_updated_at();
```

## Step 4 — `messages` table (SQL editor)

```sql
create table public.messages (
    id          uuid primary key default gen_random_uuid(),
    sender_id   uuid not null references auth.users(id),
    receiver_id uuid not null references auth.users(id),
    content     text not null,
    created_at  timestamptz not null default now(),

    constraint chk_no_self_message check (sender_id <> receiver_id)
);
```

## Step 5 — Row Level Security (SQL editor — do this in the same sitting, don't leave tables open)

This is where your doc's "logic lives in FastAPI, not the client" rule gets DB-enforced, not just convention:

```sql
alter table public.profiles enable row level security;
alter table public.connections enable row level security;
alter table public.messages enable row level security;

-- profiles: anyone signed in can read, only owner can update. No client insert (trigger handles it).
create policy "profiles are readable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "users can update own profile"
  on public.profiles for update to authenticated using (auth.uid() = user_id);

-- connections: read your own rows. NO insert/update policy for authenticated —
-- writes only happen via FastAPI using the service_role key, which bypasses RLS.
create policy "users can read own connections"
  on public.connections for select to authenticated
  using (auth.uid() = user_id_a or auth.uid() = user_id_b);

-- messages: read your own conversations. Same rule — no client-side insert.
create policy "users can read own messages"
  on public.messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);
```

Deliberately no `insert`/`update` policy on `connections` or `messages` for the `authenticated` role — that absence *is* the enforcement. If Lovable's frontend ever tries to write directly to these tables, it fails at the DB, not just at code review.

## Step 6 — Enable Realtime (dashboard or SQL)

Database → Replication → toggle on `connections` and `messages`, or:

```sql
alter publication supabase_realtime add table public.connections;
alter publication supabase_realtime add table public.messages;
```

This is what lets the frontend subscribe directly per your responsibility split — reads bypass FastAPI, writes don't.

## Step 7 — Verify before writing any FastAPI code

Do this in the SQL editor with two dummy `auth.users` rows (Authentication → Users → Add user, create two test accounts, grab their UUIDs):

1. Run the request upsert from the state-machine doc with test UUIDs — confirm a `PENDING` row appears.
2. Run it again with the same requester — confirm no duplicate row (constraint + `WHERE` clause holds).
3. Run it a third time with the *other* user as requester — confirm the row flips to `ACCEPTED` (this is your mutual-request race case, and you're testing it manually before any app code exists to get it wrong).
4. Try a direct `insert into connections ...` as if from the `authenticated` role (Supabase SQL editor lets you test as a role) — confirm it's rejected by RLS.

Only once all four pass do you move to **Step 3 of the MVP doc** — scaffolding FastAPI and the JWT-verification dependency. Everything above is infrastructure; nothing above should need revisiting once FastAPI work starts, aside from adding indexes if query performance becomes a concern later.
