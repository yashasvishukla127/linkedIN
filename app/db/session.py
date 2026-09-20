from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from sqlalchemy.pool import NullPool
engine = create_async_engine(settings.database_url, echo=False, poolclass=NullPool)

# Using the direct connection (port 5432)? Leave this as-is.
# Switched DATABASE_URL to the port-6543 transaction pooler later? Add:
#   connect_args={"statement_cache_size": 0}
# as a second argument to create_async_engine below.
engine = create_async_engine(settings.database_url, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
