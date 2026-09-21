# security.py
import jwt
import httpx
from typing import Any
from jwt import PyJWKClient
from fastapi import Header, HTTPException, status
from app.core.config import settings


class SupabaseJWKClient(PyJWKClient):
    def fetch_data(self) -> Any:
        with httpx.Client() as client:
            resp = client.get(
                self.uri,
                headers={"apikey": settings.supabase_anon_key}
            )
            resp.raise_for_status()
            return resp.json()


_jwk_client = SupabaseJWKClient(settings.supabase_jwks_url, cache_keys=True)


def get_current_user_id(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.removeprefix("Bearer ")
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as e:
        print(f"[AUTH FAIL] {type(e).__name__}: {e}")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")
    return payload["sub"]