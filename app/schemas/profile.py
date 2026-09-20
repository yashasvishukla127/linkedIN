import uuid
from datetime import datetime

from pydantic import BaseModel


class ProfileOut(BaseModel):
    user_id: uuid.UUID
    name: str
    headline: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    background_url: str | None = None
    updated_at: datetime

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    name: str | None = None
    headline: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    background_url: str | None = None
