import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import httpx

# Your environment variables
DATABASE_URL = "postgresql+asyncpg://postgres.pymfcencnxkgekjpjuyi:YAsh%40%23941144@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
SUPABASE_URL = "https://pymfcencnxkgekjpjuyi.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bWZjZW5jbnhrZ2VranBqdXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTYxOTUsImV4cCI6MjEwNTEzMjE5NX0.8UearimSb147TTeLW9g1vqtoqecnq6tkSfesSG-3sVM"

async def test_database_connection():
    print("--- 1. Testing Database Connection (PostgreSQL Pooler) ---")
    try:
        engine = create_async_engine(DATABASE_URL)
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version();"))
            row = result.fetchone()
            print(" [SUCCESS] Connected to DB!")
            print(f" PostgreSQL Version: {row[0]}\n")
        await engine.dispose()
    except Exception as e:
        print(f" [FAILED] Database connection error: {e}\n")

async def test_supabase_anon_key():
    print("--- 2. Testing REST API Authorization (Anon Key) ---")
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
    }
    async with httpx.AsyncClient() as client:
        try:
            # Pinging the auth settings endpoint to test authorization
            res = await client.get(f"{SUPABASE_URL}/auth/v1/settings", headers=headers)
            print(f" Status Code: {res.status_code}")
            if res.status_code == 200:
                print(" [SUCCESS] ANON key is valid and authorized!")
            else:
                print(f" [FAILED] Authorization rejected: {res.text}")
        except Exception as e:
            print(f" [FAILED] Network request failed: {e}\n")

async def main():
    await test_database_connection()
    await test_supabase_anon_key()

if __name__ == "__main__":
    asyncio.run(main())