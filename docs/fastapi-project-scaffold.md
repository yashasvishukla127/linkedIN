# FastAPI Project Scaffold — Step by Step

## Step 1 — Dependencies

```txt
# requirements.txt
fastapi
uvicorn[standard]
sqlalchemy[asyncio]>=2.0
asyncpg
pydantic
pydantic-settings
pyjwt[crypto]
python-dotenv
pytest
pytest-asyncio
httpx
```

**macOS / Linux:**
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Windows (PowerShell):**
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```
If activation fails with a script-execution error, PowerShell's default policy is blocking it — run this once (as your normal user, not admin) and try activating again: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

**Windows (cmd.exe):**
```cmd
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
```

**Force-deleting and reinstalling `.venv`** (do this if packages get into a broken state — deactivate first, in whichever shell you're using):

macOS/Linux:
```bash
deactivate
rm -rf .venv
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows PowerShell:
```powershell
deactivate
Remove-Item -Recurse -Force .venv
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Windows cmd.exe:
```cmd
deactivate
rmdir /s /q .venv
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
```

`asyncpg` + Supabase gotcha worth knowing before you hit it. Nothing to run yet — this is just background for a decision you'll make in Step 5, once `app/db/session.py` exists. At your current stage (`.venv` + `requirements.txt` only), there's nothing to act on here yet; keep reading and it'll click into place when you get there.

**What's actually going on:** Supabase gives you more than one connection string, found via your project's **Connect** button (top of the dashboard page):

- **Direct connection** (port `5432`, host `db.<project-ref>.supabase.co`) — talks straight to Postgres, no pooling. In practice this host often won't resolve unless your network has IPv6 or you've paid for Supabase's IPv4 add-on — most home/office IPv4 connections will just time out. Skip this one unless you know you have IPv6.
- **Session pooler** (port `5432`, host `aws-0-<region>.pooler.supabase.com`) — reachable over plain IPv4, and behaves like a direct connection for `asyncpg`'s purposes: no prepared-statement restriction. **This is the one to use.**
- **Transaction pooler / Supavisor** (port `6543`, same pooler host) — a connection-pooling proxy meant for serverless/high-concurrency setups where hundreds of short-lived clients would otherwise exhaust Postgres's connection limit. It multiplexes many client connections onto a small pool of real Postgres connections, but only for the duration of one transaction at a time.

**Why the transaction pooler matters, even though you're not using it yet:** `asyncpg` (the Python driver you just installed) speeds up repeated queries by preparing a statement once and reusing it (a "prepared statement"). It does this automatically, you don't opt in. The transaction pooler doesn't support that — because the underlying Postgres connection can be handed to a *different* client between transactions, a prepared statement from one client could otherwise leak into another's session. So if your `DATABASE_URL` ever points at port `6543` and you don't tell `asyncpg` to stop preparing statements, your first query works, and then things fail with cryptic errors like `prepared statement "..." does not exist`.

**What to actually do, concretely:**
- In Step 3's `.env`, use the **Session pooler** string (port `5432`, `aws-0-<region>.pooler.supabase.com` host) from the Connect dialog. Nothing else to configure — skip the rest of this box.
- Only if you later switch to the port-`6543` transaction pooler string (e.g. once you deploy somewhere serverless that opens many short-lived connections): add `connect_args={"statement_cache_size": 0}` to the `create_async_engine(...)` call. That line goes inside `app/db/session.py` — Step 5 below shows exactly where.

For now, at your stage, the only actionable thing is: when you write `.env` in Step 3, grab the **Session pooler** string, not "Direct connection" and not "Transaction pooler."

## Step 2 — Folder layout

```
app/
  main.py
  core/
    config.py
    security.py
  db/
    base.py
    session.py
  models/
    profile.py
    connection.py
    message.py
  schemas/
    profile.py
    connection.py
    message.py
  api/
    deps.py
    routes/
      connections.py
      messages.py
      profiles.py
tests/
  conftest.py
  test_connections.py
.env
```

## Step 3 — `app/core/config.py`

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    supabase_url: str          # e.g. https://xxxx.supabase.co
    supabase_jwks_url: str = ""  # derived below if left blank

    class Config:
        env_file = ".env"

    def model_post_init(self, __context) -> None:
        if not self.supabase_jwks_url:
            self.supabase_jwks_url = f"{self.supabase_url}/auth/v1/jwks.json"

settings = Settings()
```

```bash
# .env
# From Supabase dashboard -> Connect -> "Session pooler" connection string.
# (Not "Direct connection" — that host often won't resolve without IPv6/IPv4 add-on.
#  Session pooler behaves like a direct connection, just reachable over plain IPv4.)
DATABASE_URL=postgresql+asyncpg://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
```

## Step 4 — `app/core/security.py` (JWT verification)

```python
import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException, status
from app.core.config import settings

_jwk_client = PyJWKClient(settings.supabase_jwks_url)

def get_current_user_id(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.removeprefix("Bearer ")
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")
    return payload["sub"]  # this is the Supabase auth.users.id (uuid, as string)
```

`PyJWKClient` caches the JWKS response internally, so this doesn't hit the network on every request.

## Step 5 — `app/db/base.py` and `app/db/session.py`

```python
# app/db/base.py
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass
```

```python
# app/db/session.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

# Using the direct connection (port 5432) from Step 1's note? Leave this as-is.
# Switched DATABASE_URL to the port-6543 transaction pooler later? Add:
#   connect_args={"statement_cache_size": 0}
# as a second argument to create_async_engine below.
engine = create_async_engine(settings.database_url, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
```

## Step 6 — Models (`app/models/`)

```python
# app/models/profile.py
import uuid
from sqlalchemy import String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class Profile(Base):
    __tablename__ = "profiles"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    headline: Mapped[str | None] = mapped_column(String, nullable=True)
    bio: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    background_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

```python
# app/models/connection.py
import uuid
from sqlalchemy import String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class Connection(Base):
    __tablename__ = "connections"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id_a: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    user_id_b: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    requester_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

```python
# app/models/message.py
import uuid
from sqlalchemy import String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class Message(Base):
    __tablename__ = "messages"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    receiver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

These mirror tables you already created in Supabase — SQLAlchemy doesn't create/migrate them here (no `Base.metadata.create_all`), it just maps to what the SQL editor already built. Keep Supabase SQL as the source of truth for schema; these models follow it, not the other way round.

## Step 7 — Schemas (`app/schemas/`)

```python
# app/schemas/connection.py
import uuid
from datetime import datetime
from pydantic import BaseModel

class ConnectionOut(BaseModel):
    id: uuid.UUID
    other_user_id: uuid.UUID
    status: str
    requester_id: uuid.UUID
    updated_at: datetime

    class Config:
        from_attributes = True
```

```python
# app/schemas/message.py
import uuid
from datetime import datetime
from pydantic import BaseModel, Field

class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)

class MessageOut(BaseModel):
    id: uuid.UUID
    sender_id: uuid.UUID
    receiver_id: uuid.UUID
    content: str
    created_at: datetime

    class Config:
        from_attributes = True
```

## Step 8 — `app/api/deps.py`

```python
from app.db.session import get_db
from app.core.security import get_current_user_id

# re-exported here so route files import one place, not two
__all__ = ["get_db", "get_current_user_id"]
```

## Step 9 — Routes (`app/api/routes/connections.py`)

This is where the upsert SQL from your state-machine doc actually gets called:

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_current_user_id

router = APIRouter(prefix="/connections", tags=["connections"])

UPSERT_SQL = text("""
INSERT INTO connections (user_id_a, user_id_b, requester_id, status)
VALUES (LEAST(:me, :other), GREATEST(:me, :other), :me, 'PENDING')
ON CONFLICT (user_id_a, user_id_b)
DO UPDATE SET status = 'ACCEPTED', updated_at = now()
WHERE connections.status = 'PENDING' AND connections.requester_id <> EXCLUDED.requester_id
RETURNING id, status, requester_id
""")

@router.post("/{other_user_id}/request")
async def send_request(
    other_user_id: uuid.UUID,
    me: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    me_uuid = uuid.UUID(me)
    if me_uuid == other_user_id:
        raise HTTPException(400, "Cannot connect to yourself")

    result = await db.execute(UPSERT_SQL, {"me": me_uuid, "other": other_user_id})
    row = result.first()
    await db.commit()

    if row is not None:
        return {"status": row.status}  # PENDING (new) or ACCEPTED (mutual race resolved)

    # Row existed but WHERE clause didn't match — fetch it to tell the client why
    existing = await db.execute(
        text("SELECT status, requester_id FROM connections WHERE user_id_a = LEAST(:a,:b) AND user_id_b = GREATEST(:a,:b)"),
        {"a": me_uuid, "b": other_user_id},
    )
    existing_row = existing.first()
    if existing_row.status == "PENDING" and existing_row.requester_id == me_uuid:
        raise HTTPException(409, "Request already pending")
    if existing_row.status == "ACCEPTED":
        raise HTTPException(409, "Already connected")

    # REJECTED / CANCELLED — allow re-request
    await db.execute(
        text("UPDATE connections SET requester_id = :me, status = 'PENDING', updated_at = now() "
             "WHERE user_id_a = LEAST(:me,:other) AND user_id_b = GREATEST(:me,:other)"),
        {"me": me_uuid, "other": other_user_id},
    )
    await db.commit()
    return {"status": "PENDING"}


@router.patch("/{other_user_id}/accept")
async def accept_request(
    other_user_id: uuid.UUID,
    me: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    me_uuid = uuid.UUID(me)
    result = await db.execute(
        text("UPDATE connections SET status = 'ACCEPTED', updated_at = now() "
             "WHERE user_id_a = LEAST(:me,:other) AND user_id_b = GREATEST(:me,:other) "
             "AND status = 'PENDING' AND requester_id <> :me RETURNING id"),
        {"me": me_uuid, "other": other_user_id},
    )
    row = result.first()
    await db.commit()
    if row is None:
        raise HTTPException(409, "No pending request from this user to accept")
    return {"status": "ACCEPTED"}


@router.get("")
async def list_connections(
    me: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    me_uuid = uuid.UUID(me)
    result = await db.execute(
        text("SELECT id, CASE WHEN user_id_a = :me THEN user_id_b ELSE user_id_a END AS other_user_id, "
             "updated_at FROM connections WHERE (user_id_a = :me OR user_id_b = :me) AND status = 'ACCEPTED' "
             "ORDER BY updated_at DESC"),
        {"me": me_uuid},
    )
    return [dict(r._mapping) for r in result.all()]
```

Raw `text()` SQL here is deliberate, not a shortcut you'll regret — this logic is the exact upsert from your state-machine spec, and expressing `LEAST`/`GREATEST`/`ON CONFLICT ... DO UPDATE ... WHERE` through the SQLAlchemy ORM query builder buys you nothing and risks it silently producing different SQL than what you tested in the Supabase SQL editor.

## Step 10 — `app/api/routes/messages.py`

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_current_user_id
from app.schemas.message import MessageCreate

router = APIRouter(prefix="/messages", tags=["messages"])

@router.post("/{other_user_id}")
async def send_message(
    other_user_id: uuid.UUID,
    body: MessageCreate,
    me: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    me_uuid = uuid.UUID(me)
    connected = await db.execute(
        text("SELECT 1 FROM connections WHERE user_id_a = LEAST(:me,:other) AND user_id_b = GREATEST(:me,:other) AND status = 'ACCEPTED'"),
        {"me": me_uuid, "other": other_user_id},
    )
    if connected.first() is None:
        raise HTTPException(403, "Not connected with this user")

    result = await db.execute(
        text("INSERT INTO messages (sender_id, receiver_id, content) VALUES (:sender, :receiver, :content) RETURNING id, created_at"),
        {"sender": me_uuid, "receiver": other_user_id, "content": body.content},
    )
    row = result.first()
    await db.commit()
    return {"id": row.id, "created_at": row.created_at}
```

This is your entire v1 authorization model, exactly as scoped in your MVP doc: one `SELECT` gate before the `INSERT`, nothing fancier.

## Step 11 — `app/main.py`

```python
from fastapi import FastAPI
from app.api.routes import connections, messages

app = FastAPI(title="Connection App API")
app.include_router(connections.router)
app.include_router(messages.router)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

Run it:

```bash
uvicorn app.main:app --reload
```

## Step 12 — Testing without fighting real JWTs

Don't try to forge Supabase-signed tokens in tests. Override the dependency instead — but two things about the version above need fixing before it actually supports the concurrency test you need:

1. `TEST_USER_A = uuid.uuid4()` generates a random id that **doesn't exist in `auth.users`**. Every insert into `connections` or `messages` has a foreign key to `auth.users(id)`, so any test using a made-up uuid will fail on the FK constraint, not on your logic. Use the two real dummy users you already created in Supabase for the manual SQL verification.
2. `app.dependency_overrides` is one global dict shared by the whole app. A fixture that sets it to "always return user A" can't also have a second, concurrent request acting as user B at the same time — and the mutual-request race test needs exactly that (two different users hitting the API simultaneously). Override the dependency once, to read the identity from a header the test controls per-request, instead of baking one fixed user into the override itself:

```python
# tests/conftest.py
import os
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.deps import get_current_user_id
from fastapi import Header

# The two dummy users you created in Supabase Auth for manual SQL verification —
# put their real UUIDs in .env.test, don't regenerate random ones here.
TEST_USER_A = uuid.UUID(os.environ["TEST_USER_A_ID"])
TEST_USER_B = uuid.UUID(os.environ["TEST_USER_B_ID"])

def _fake_current_user(x_test_user: str = Header(...)) -> str:
    return x_test_user

@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user_id] = _fake_current_user
    yield
    app.dependency_overrides.clear()

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

@pytest.fixture(autouse=True)
async def clean_connection_row(client):
    # the unique constraint means only one row can ever exist for this pair —
    # tests need a clean slate each time, not a growing history
    from app.db.session import SessionLocal
    from sqlalchemy import text
    async with SessionLocal() as db:
        await db.execute(
            text("DELETE FROM connections WHERE user_id_a = LEAST(:a,:b) AND user_id_b = GREATEST(:a,:b)"),
            {"a": TEST_USER_A, "b": TEST_USER_B},
        )
        await db.commit()
    yield
```

One real client, one overridden dependency that reads a header — now any test can make two "different users" call the API in the same instant just by setting a different `X-Test-User` header per request, which is what `asyncio.gather` needs below. Real JWT verification (the actual `PyJWKClient` path) is exercised separately, once, by hand against a real token from a test login — that's Step 13.

```python
# tests/test_connections.py
import asyncio
from tests.conftest import TEST_USER_A, TEST_USER_B

def auth_headers(user_id):
    return {"X-Test-User": str(user_id)}

async def test_send_request_creates_pending(client):
    r = await client.post(f"/connections/{TEST_USER_B}/request", headers=auth_headers(TEST_USER_A))
    assert r.status_code == 200
    assert r.json()["status"] == "PENDING"

async def test_duplicate_request_rejected(client):
    await client.post(f"/connections/{TEST_USER_B}/request", headers=auth_headers(TEST_USER_A))
    r = await client.post(f"/connections/{TEST_USER_B}/request", headers=auth_headers(TEST_USER_A))
    assert r.status_code == 409

async def test_accept_flow(client):
    await client.post(f"/connections/{TEST_USER_B}/request", headers=auth_headers(TEST_USER_A))
    r = await client.patch(f"/connections/{TEST_USER_A}/accept", headers=auth_headers(TEST_USER_B))
    assert r.status_code == 200
    listed = await client.get("/connections", headers=auth_headers(TEST_USER_A))
    assert any(str(TEST_USER_B) == row["other_user_id"] for row in listed.json())

async def test_mutual_simultaneous_request_resolves_to_one_connection(client):
    # this is edge case #2 from your original spec — fire both directions at once
    r1, r2 = await asyncio.gather(
        client.post(f"/connections/{TEST_USER_B}/request", headers=auth_headers(TEST_USER_A)),
        client.post(f"/connections/{TEST_USER_A}/request", headers=auth_headers(TEST_USER_B)),
    )
    statuses = {r1.json()["status"], r2.json()["status"]}
    # whichever transaction lost the race gets the ACCEPTED branch of the upsert
    assert "ACCEPTED" in statuses

    listed = await client.get("/connections", headers=auth_headers(TEST_USER_A))
    assert len(listed.json()) == 1  # never two rows for the same pair

async def test_message_blocked_before_connection(client):
    r = await client.post(f"/messages/{TEST_USER_B}", json={"content": "hi"}, headers=auth_headers(TEST_USER_A))
    assert r.status_code == 403

async def test_message_allowed_after_connection(client):
    await client.post(f"/connections/{TEST_USER_B}/request", headers=auth_headers(TEST_USER_A))
    await client.patch(f"/connections/{TEST_USER_A}/accept", headers=auth_headers(TEST_USER_B))
    r = await client.post(f"/messages/{TEST_USER_B}", json={"content": "hi"}, headers=auth_headers(TEST_USER_A))
    assert r.status_code == 200
```

Run it:

```bash
pytest -v
```

If a test fails on the FK constraint, it means `TEST_USER_A_ID`/`TEST_USER_B_ID` in your environment don't match real rows in `auth.users` — go back to Supabase Auth → Users and copy the actual UUIDs, don't invent them.

## Step 13 — Manual smoke test against the real running server

This exercises the one thing Step 12's tests deliberately skip: real Supabase JWT verification through `PyJWKClient`. Do this once, by hand, after the automated tests pass — it's your proof that a real browser-issued token actually works end to end, not just your test override.

1. **Confirm the server boots:**
   ```bash
   curl http://127.0.0.1:8000/health
   # {"status":"ok"}
   ```
2. **Get a real access token** for one of your two dummy Supabase users (find your anon key in Project Settings → API):
   ```bash
   curl -X POST 'https://<project-ref>.supabase.co/auth/v1/token?grant_type=password' \
     -H "apikey: <anon-key>" \
     -H "Content-Type: application/json" \
     -d '{"email": "<test-user-a-email>", "password": "<their-password>"}'
   ```
   Copy the `access_token` from the response — this is a real, Supabase-signed JWT, not the fake header from Step 12.
3. **Call your API with it:**
   ```bash
   curl -X POST http://127.0.0.1:8000/connections/<test-user-b-uuid>/request \
     -H "Authorization: Bearer <access_token>"
   ```
   If this returns `{"status":"PENDING"}`, `PyJWKClient` successfully fetched Supabase's JWKS, verified the signature, and your route read the real `sub` claim as the user id — the one part of the system Step 12's tests can't cover.
4. **Repeat with the second dummy user's token** to call `PATCH /connections/<user-a-uuid>/accept`, then `GET /connections`, then `POST /messages/<other-uuid>`, confirming each matches what the automated tests already asserted.
5. **Deliberately break it once**: call an endpoint with an expired, malformed, or missing token and confirm you get a `401`, not a `500` — a stack trace leaking here means `security.py`'s exception handling needs a second look before this goes anywhere near a frontend.

## What to build in what order

1. Steps 1–8 (deps, config, security, db, models, schemas) — no running server yet, just confirm `python -c "from app.main import app"` doesn't error.
2. Step 9 (`connections.py`) — this is your highest-risk logic, matching the state machine you already designed and manually verified in SQL. Test it against the two dummy Supabase users you already created.
3. Step 10 (`messages.py`) — trivial once step 9 works, since it only reads `connections`.
4. Step 11 — wire up `main.py`, run the server locally.
5. Step 12 — automated tests against the header-based fake auth: happy path, duplicate-request rejection, the mutual-request race, and the message-authorization gate.
6. Step 13 — one manual pass with real Supabase JWTs, to prove the one part Step 12 can't test: actual token verification.

Only after both 12 and 13 pass does the Lovable/v0 frontend get built against these three endpoints.
