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
    # edge case #2 from the original spec -- fire both directions at once
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
    r = await client.post(
        f"/messages/{TEST_USER_B}", json={"content": "hi"}, headers=auth_headers(TEST_USER_A)
    )
    assert r.status_code == 403


async def test_message_allowed_after_connection(client):
    await client.post(f"/connections/{TEST_USER_B}/request", headers=auth_headers(TEST_USER_A))
    await client.patch(f"/connections/{TEST_USER_A}/accept", headers=auth_headers(TEST_USER_B))
    r = await client.post(
        f"/messages/{TEST_USER_B}", json={"content": "hi"}, headers=auth_headers(TEST_USER_A)
    )
    assert r.status_code == 200
