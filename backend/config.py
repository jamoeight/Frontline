from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://frontline:frontline_dev@localhost:5432/frontline"
    database_url_sync: str = "postgresql+psycopg2://frontline:frontline_dev@localhost:5432/frontline"
    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-oss-120b:free"

    model_config = {"env_file": ".env"}


settings = Settings()
