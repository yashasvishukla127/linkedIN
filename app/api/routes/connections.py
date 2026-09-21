import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user_id

router = APIRouter(prefix="/connections", tags=["connections"])


def _ordered_pair(a: uuid.UUID, b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    return (a, b) if a < b else (b, a)


UPSERT_SQL = text("""
INSERT INTO connections (user_id_a, user_id_b, requester_id, status)
VALUES (:user_a, :user_b, :me, 'PENDING')
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

    user_a, user_b = _ordered_pair(me_uuid, other_user_id)
    result = await db.execute(
        UPSERT_SQL,
        {"me": me_uuid, "user_a": user_a, "user_b": user_b},
    )
    row = result.first()
    await db.commit()

    if row is not None:
        return {"status": row.status}  # PENDING (new) or ACCEPTED (mutual race resolved)

    # Row existed but WHERE clause didn't match -- fetch it to tell the client why
    existing = await db.execute(
        text(
            "SELECT status, requester_id FROM connections "
            "WHERE user_id_a = :user_a AND user_id_b = :user_b"
        ),
        {"user_a": user_a, "user_b": user_b},
    )
    existing_row = existing.first()
    if existing_row.status == "PENDING" and existing_row.requester_id == me_uuid:
        raise HTTPException(409, "Request already pending")
    if existing_row.status == "ACCEPTED":
        raise HTTPException(409, "Already connected")

    # REJECTED / CANCELLED -- allow re-request
    await db.execute(
        text(
            "UPDATE connections SET requester_id = :me, status = 'PENDING', updated_at = now() "
            "WHERE user_id_a = :user_a AND user_id_b = :user_b"
        ),
        {"me": me_uuid, "user_a": user_a, "user_b": user_b},
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
    user_a, user_b = _ordered_pair(me_uuid, other_user_id)
    result = await db.execute(
        text(
            "UPDATE connections SET status = 'ACCEPTED', updated_at = now() "
            "WHERE user_id_a = :user_a AND user_id_b = :user_b "
            "AND status = 'PENDING' AND requester_id <> :me RETURNING id"
        ),
        {"me": me_uuid, "user_a": user_a, "user_b": user_b},
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
        text(
            "SELECT id, CASE WHEN user_id_a = :me THEN user_id_b ELSE user_id_a END AS other_user_id, "
            "updated_at FROM connections WHERE (user_id_a = :me OR user_id_b = :me) AND status = 'ACCEPTED' "
            "ORDER BY updated_at DESC"
        ),
        {"me": me_uuid},
    )
    return [dict(r._mapping) for r in result.all()]







@router.get("/pending")
async def list_pending(
    me: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    me_uuid = uuid.UUID(me)
    result = await db.execute(
        text("SELECT id, requester_id, "
             "CASE WHEN user_id_a = :me THEN user_id_b ELSE user_id_a END AS other_user_id, "
             "status, updated_at FROM connections "
             "WHERE (user_id_a = :me OR user_id_b = :me) AND status = 'PENDING'"),
        {"me": me_uuid},
    )
    rows = [dict(r._mapping) for r in result.all()]
    for r in rows:
        r["direction"] = "outgoing" if r["requester_id"] == me_uuid else "incoming"
    return rows