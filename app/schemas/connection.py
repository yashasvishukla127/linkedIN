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
