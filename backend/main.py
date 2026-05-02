from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import engine
from backend.routers import trends, trending, papers, query, stats, status, briefing


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(
    title="Frontline AI",
    description="AI Research Trend Tracking Dashboard",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://141.227.135.140",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trends.router)
app.include_router(trending.router)
app.include_router(papers.router)
app.include_router(query.router)
app.include_router(status.router)
app.include_router(stats.router)
app.include_router(briefing.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
