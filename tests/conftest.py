import os
import uuid

import pytest
from dotenv import load_dotenv
from fastapi import Header
from httpx import AsyncClient, ASGITransport

load_dotenv(".env.test")

from app.main import app
from app.api.deps import get_current_user_id

# The two dummy users you created in Supabase Auth for manual SQL verification --
# put their real UUIDs in .env.test, don't regenerate random ones here. Every
# insert into connections/messages has a foreign key to auth.users(id), so a
# made-up uuid fails on the FK constraint, not on your logic.
TEST_USER_A = uuid.UUID(os.environ["TEST_USER_A_ID"])
TEST_USER_B = uuid.UUID(os.environ["TEST_USER_B_ID"])


def _fake_current_user(x_test_user: str = Header(...)) -> str:
    return x_test_user


@pytest.fixture(autouse=True)
def override_auth():
    # One override, reading identity from a per-request header -- not a fixed
    # value baked into the override itself. app.dependency_overrides is a single
    # global dict for the whole app, so a fixture that hardcodes "always user A"
    # can't also have a concurrent request act as user B at the same instant,
    # which the mutual-request race test needs.
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
    # the unique constraint means only one row can ever exist for this pair --
    # tests need a clean slate each time, not a growing history
    from sqlalchemy import text

    from app.db.session import SessionLocal

    async with SessionLocal() as db:
        await db.execute(
            text(
                "DELETE FROM connections WHERE user_id_a = LEAST(CAST(:a AS uuid), CAST(:b AS uuid)) "
                "AND user_id_b = GREATEST(CAST(:a AS uuid), CAST(:b AS uuid))"
            ),
            {"a": TEST_USER_A, "b": TEST_USER_B},
        )
        await db.commit()
    yield