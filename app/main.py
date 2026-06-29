from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.campaigns import router as campaigns_router
from app.api.health import router as health_router
from app.config import get_settings

WEB_DIR = Path(__file__).parent / "web"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")

    @app.get("/", include_in_schema=False)
    async def ui_shell() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")

    app.include_router(health_router)
    app.include_router(campaigns_router)
    return app


app = create_app()
