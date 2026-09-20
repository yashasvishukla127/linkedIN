# Connection App — DB State Machine & Row/Status Spec

## 1. Schema change: merge `connection_requests` + `connections` into one table

Your two docs planned separate `connection_requests` and `connections` tables. That's the source of both edge cases you listed — two tables means two places a race condition can leave inconsistent state. **Collapse them into one table.** A request and a connection are the same edge in the social graph at different lifecycle stages, not two different entities.

```sql
CREATE TABLE connections (
    id            BIGSERIAL PRIMARY KEY,
    user_id_a     BIGINT NOT NULL,   -- always the smaller id
    user_id_b     BIGINT NOT NULL,   -- always the larger id
    requester_id  BIGINT NOT NULL,   -- who currently "owns" the pending action
    status        TEXT NOT NULL CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_order      CHECK (user_id_a < user_id_b),
    CONSTRAINT chk_requester  CHECK (requester_id IN (user_id_a, user_id_b)),
    CONSTRAINT uq_pair        UNIQUE (user_id_a, user_id_b)
);
```

Key property: **one row per user pair, ever.** No partial indexes, no "check pending first then insert" race window — the full unique constraint on `(user_id_a, user_id_b)` is the only guard you need, and it's DB-enforced regardless of direction.

`status = 'ACCEPTED'` is your single source of truth for "these two are connected." No separate `connections` table to keep in sync.

## 2. Status values and transitions

| From | Event | To | Who can trigger |
|---|---|---|---|
| (no row) | A requests B | `PENDING` | requester |
| `PENDING` | receiver accepts | `ACCEPTED` | the non-requester party |
| `PENDING` | receiver rejects | `REJECTED` | the non-requester party |
| `PENDING` | requester withdraws | `CANCELLED` | requester |
| `REJECTED` / `CANCELLED` | either side re-initiates | `PENDING` (requester_id updated) | either |
| `ACCEPTED` | — | terminal, no further transitions | — |

`ACCEPTED` is terminal for v1 — no "disconnect" flow yet. Add `REMOVED` later if you need unfriend/disconnect; don't build it now.

## 3. Happy path — atomic, single statement

Every "send request" action goes through this **one** upsert. It handles the create, the duplicate check, and the mutual-request race all in one round trip:

```sql
INSERT INTO connections (user_id_a, user_id_b, requester_id, status)
VALUES (LEAST(:me, :other), GREATEST(:me, :other), :me, 'PENDING')
ON CONFLICT (user_id_a, user_id_b)
DO UPDATE SET
    status = 'ACCEPTED',
    updated_at = now()
WHERE connections.status = 'PENDING'
  AND connections.requester_id <> EXCLUDED.requester_id
RETURNING id, status, requester_id;
```

Read the returned `status` to know what happened:

- **New row, no conflict** → `PENDING`. Normal request sent.
- **Conflict, other party's PENDING row existed** → `ACCEPTED`. Their request just got auto-accepted by your request — this is edge case #2, solved for free, no app-level locking, no `SELECT ... FOR UPDATE`.
- **Conflict, but `WHERE` didn't match** (row unchanged, `RETURNING` gives you the *existing* row's actual status) — this is where you branch in app code:
  - existing status `PENDING` and `requester_id = :me` → you already have a pending request to this person. Return "request already pending," don't re-send. (Edge case #1.)
  - existing status `ACCEPTED` → already connected. Return "already connected."
  - existing status `REJECTED` or `CANCELLED` → allowed to re-request. Fire a follow-up:
    ```sql
    UPDATE connections
    SET requester_id = :me, status = 'PENDING', updated_at = now()
    WHERE user_id_a = LEAST(:me,:other) AND user_id_b = GREATEST(:me,:other)
      AND status IN ('REJECTED','CANCELLED');
    ```

This is the fix for both of your listed edge cases — worth flagging since the two-table design in your architecture docs doesn't actually prevent either of them on its own; the unique constraints as written only guard the `connections` table, not `connection_requests`, which is exactly where the duplicate-request and mutual-simultaneous-request bugs would surface.

## 4. Accept / Reject (receiver-initiated)

```sql
UPDATE connections
SET status = :new_status, updated_at = now()   -- 'ACCEPTED' or 'REJECTED'
WHERE user_id_a = LEAST(:me,:other) AND user_id_b = GREATEST(:me,:other)
  AND status = 'PENDING'
  AND requester_id <> :me      -- can't accept/reject your own outgoing request
RETURNING id;
```

If this returns zero rows, the request was already actioned (accepted/rejected/cancelled) by the time this ran — return a 409/"already handled" to the client rather than trusting client-side state.

## 5. Connections list query

```sql
SELECT
    c.id,
    CASE WHEN c.user_id_a = :me THEN c.user_id_b ELSE c.user_id_a END AS other_user_id,
    c.updated_at AS connected_at
FROM connections c
WHERE (c.user_id_a = :me OR c.user_id_b = :me)
  AND c.status = 'ACCEPTED'
ORDER BY c.updated_at DESC;
```

Join to `users`/`profiles` on `other_user_id` for display. Add pagination (keyset on `updated_at, id`) once this list can grow past a page — not needed for MVP volume.

Pending incoming/outgoing requests use the same table, just filter `status = 'PENDING'` and split on `requester_id = :me` (outgoing) vs `requester_id <> :me` (incoming).

## 6. Profile creation flow

This isn't really a state machine — it's field completeness, not status transitions. Don't over-engineer it:

```sql
CREATE TABLE profiles (
    user_id        BIGINT PRIMARY KEY REFERENCES users(id),
    name           TEXT NOT NULL,
    headline       TEXT,
    bio            TEXT,
    avatar_url     TEXT,
    background_url TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- Row created at signup (id = auth user id), all optional fields nullable.
- "Fill in details" = `PATCH`/`UPDATE` on this row, no separate draft/complete status needed for v1.
- Avatar/background: upload to storage first (Supabase storage, presigned URL), then `UPDATE profiles SET avatar_url = :url WHERE user_id = :me`. Don't model image upload as a DB state — the DB just stores the resulting URL.
- If you later want a "profile completion %" for onboarding UX, compute it at read time (`COUNT(non-null optional fields) / total`) rather than storing a derived status column that can drift out of sync.

## 7. Concurrency note (why the single UPSERT is enough)

Postgres's `INSERT ... ON CONFLICT` takes the row lock as part of the same atomic operation — you don't need `SELECT ... FOR UPDATE` or app-level locking for the request/accept race, because the unique constraint + upsert *is* the concurrency control. Two simultaneous transactions hitting the same pair will serialize at the DB level; one wins the insert, the other sees the conflict and takes the `DO UPDATE` (or no-op) branch. This is simpler and more correct than the optimistic-locking/version-column approach mentioned in your architecture doc for this specific case — save that pattern for places where you're updating a row based on a value you read earlier in the same request (there isn't one here).
