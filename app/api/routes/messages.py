import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user_id
from app.schemas.message import MessageCreate

router = APIRouter(prefix="/messages", tags=["messages"])


def _ordered_pair(a: uuid.UUID, b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    return (a, b) if a < b else (b, a)


@router.post("/{other_user_id}")
async def send_message(
    other_user_id: uuid.UUID,
    body: MessageCreate,
    me: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    me_uuid = uuid.UUID(me)
    user_a, user_b = _ordered_pair(me_uuid, other_user_id)
    connected = await db.execute(
        text(
            "SELECT 1 FROM connections WHERE user_id_a = :user_a "
            "AND user_id_b = :user_b AND status = 'ACCEPTED'"
        ),
        {"user_a": user_a, "user_b": user_b},
    )
    if connected.first() is None:
        raise HTTPException(403, "Not connected with this user")

    result = await db.execute(
        text(
            "INSERT INTO messages (sender_id, receiver_id, content) "
            "VALUES (:sender, :receiver, :content) RETURNING id, created_at"
        ),
        {"sender": me_uuid, "receiver": other_user_id, "content": body.content},
    )
    row = result.first()
    await db.commit()
    return {"id": row.id, "created_at": row.created_at}
