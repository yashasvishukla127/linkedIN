# scripts/live_verification.py

import asyncio
import os
import uuid

import asyncpg
import httpx
from dotenv import load_dotenv

load_dotenv()



SUPABASE_URL = os.environ["SUPABASE_URL"]
ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"].replace("+asyncpg", "")

API_BASE = "http://127.0.0.1:8000"

USER_A = {
    "email": os.environ["TEST_USER_A_EMAIL"],
    "password": os.environ["TEST_USER_A_PASSWORD"],
    "id": os.environ["TEST_USER_A_ID"],
}

USER_B = {
    "email": os.environ["TEST_USER_B_EMAIL"],
    "password": os.environ["TEST_USER_B_PASSWORD"],
    "id": os.environ["TEST_USER_B_ID"],
}



import httpx

SUPABASE_URL = "https://pymfcencnxkgekjpjuyi.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bWZjZW5jbnhrZ2VranBqdXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTYxOTUsImV4cCI6MjEwNTEzMjE5NX0.8UearimSb147TTeLW9g1vqtoqecnq6tkSfesSG-3sVM"

def create_test_user(email: str, password: str, name: str):
    resp = httpx.post(
        f"{SUPABASE_URL}/auth/v1/signup",
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        json={
            "email": email,
            "password": password,
            "data": {"name": name},  # becomes raw_user_meta_data, which your trigger reads
        },
    )
    resp.raise_for_status()
    return resp.json()["user"]["id"]   

async def get_token(client: httpx.AsyncClient, user: dict) -> str:
    r = await client.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": ANON_KEY,
            "Content-Type": "application/json",
        },
        json={
            "email": user["email"],
            "password": user["password"],
        },
    )

    if r.status_code != 200:
        print("\n--- Supabase authentication failed ---")
        print("Status:", r.status_code)
        print("Response:", r.text)
        print("User:", user["email"])
        print("---------------------------------------\n")

    r.raise_for_status()

    return r.json()["access_token"]

async def reset_connection_row():
    """Talks to Postgres directly — this is test cleanup, not app logic."""

    conn = await asyncpg.connect(DATABASE_URL)

    try:
        user_a_id = uuid.UUID(USER_A["id"])
        user_b_id = uuid.UUID(USER_B["id"])

        await conn.execute(
            """
            DELETE FROM connections
            WHERE user_id_a = LEAST($1::uuid, $2::uuid)
              AND user_id_b = GREATEST($1::uuid, $2::uuid)
            """,
            user_a_id,
            user_b_id,
        )

    finally:
        await conn.close()


async def main():
    # Clean up any existing connection between A and B
    await reset_connection_row()

    # Get fresh Supabase access tokens
    async with httpx.AsyncClient() as auth:
        token_a = await get_token(auth, USER_A)
        token_b = await get_token(auth, USER_B)

    headers_a = {
        "Authorization": f"Bearer {token_a}",
    }

    headers_b = {
        "Authorization": f"Bearer {token_b}",
    }

    async with httpx.AsyncClient(base_url=API_BASE) as api:

        # ---------------------------------------------------------
        # 1. Setup: User A sends connection request to User B
        # ---------------------------------------------------------

        print("--- setup: A requests B ---")

        r = await api.post(
            f"/connections/{USER_B['id']}/request",
            headers=headers_a,
        )

        print(r.status_code, r.json())

        assert (
            r.status_code == 200
            and r.json()["status"] == "PENDING"
        ), f"connection request failed: {r.status_code} {r.text}"

        # ---------------------------------------------------------
        # 2. Test concurrent accept
        # ---------------------------------------------------------

        print("\n--- test: two simultaneous accept calls from B ---")

        r1, r2 = await asyncio.gather(
            api.patch(
                f"/connections/{USER_A['id']}/accept",
                headers=headers_b,
            ),
            api.patch(
                f"/connections/{USER_A['id']}/accept",
                headers=headers_b,
            ),
        )

        print("accept #1:", r1.status_code, r1.text)
        print("accept #2:", r2.status_code, r2.text)

        codes = sorted(
            [
                r1.status_code,
                r2.status_code,
            ]
        )

        assert codes == [200, 409], (
            f"expected one 200 + one 409, got {codes}"
        )

        # ---------------------------------------------------------
        # 3. Verify only one connection exists
        # ---------------------------------------------------------

        listing = await api.get(
            "/connections",
            headers=headers_a,
        )

        rows = listing.json()

        print(
            "\nA's connections after double-accept:",
            rows,
        )

        assert len(rows) == 1, (
            "double-accept must not produce more than one "
            "connection row"
        )

        # ---------------------------------------------------------
        # 4. Verify messaging is allowed while connected
        # ---------------------------------------------------------

        print("\n--- test: message allowed once connected ---")

        msg = await api.post(
            f"/messages/{USER_B['id']}",
            json={
                "content": "hello",
            },
            headers=headers_a,
        )

        print(msg.status_code, msg.json())

        assert msg.status_code == 200, (
            f"message should be allowed while connected: "
            f"{msg.status_code} {msg.text}"
        )

        # ---------------------------------------------------------
        # 5. Disconnect / remove connection
        # ---------------------------------------------------------

        print("\n--- test: message blocked once disconnected ---")

        await reset_connection_row()

        # ---------------------------------------------------------
        # 6. Verify messaging is blocked after disconnect
        # ---------------------------------------------------------

        blocked = await api.post(
            f"/messages/{USER_B['id']}",
            json={
                "content": "hello",
            },
            headers=headers_a,
        )

        print(blocked.status_code)

        assert blocked.status_code == 403, (
            f"message should be blocked after disconnect: "
            f"{blocked.status_code} {blocked.text}"
        )

        # ---------------------------------------------------------
        # All tests passed
        # ---------------------------------------------------------

        print(
            "\nAll checks passed — "
            "idempotency and message authorization "
            "hold under real concurrency."
        )


if __name__ == "__main__":
    asyncio.run(main())