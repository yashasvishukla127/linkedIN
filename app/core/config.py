from pydantic import ConfigDict
from pydantic_settings import BaseSettings
from typing import Any

class Settings(BaseSettings):
    model_config = ConfigDict(
        env_file=".env",
        extra="ignore"
    )

    database_url: str
    supabase_url: str
    supabase_anon_key: str 
    supabase_jwt_secret: str
    supabase_jwks_url: str = ""

    def model_post_init(self, __context) -> None:
        if not self.supabase_jwks_url:          # explicit .env value skips this
            self.supabase_jwks_url = f"{self.supabase_url}/auth/v1/jwks.json"


settings = Settings()