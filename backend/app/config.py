from pydantic_settings import BaseSettings
from pathlib import Path

# Docker: /app/app/config.py -> /app
# Local:  backend/app/config.py -> backend
BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    database_url: str = f"sqlite+aiosqlite:///{BASE_DIR}/data/maximo.db"
    data_dir: str = str(BASE_DIR / "data")
    exports_dir: str = str(BASE_DIR / "data" / "exports")

    class Config:
        env_file = str(BASE_DIR / ".env")

settings = Settings()
