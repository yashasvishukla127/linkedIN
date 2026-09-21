import asyncio
import os

import asyncpg
from dotenv import load_dotenv

load_dotenv()


async def main():
    database_url = os.environ["DATABASE_URL"].replace("+asyncpg", "")

    conn = await asyncpg.connect(database_url)

    try:
        result = await conn.fetchval("SELECT 1")
        print("Database connection OK:", result)
    finally:
        await conn.close()


asyncio.run(main())