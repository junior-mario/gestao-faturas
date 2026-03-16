import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base, SessionLocal
from app.seed import seed_faturas
from app.routers import auth, faturas, monthly

os.makedirs("data", exist_ok=True)
os.makedirs(os.getenv("UPLOAD_DIR", "uploads"), exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_faturas(db)
        auth.ensure_default_admin(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Gestão de Faturas — Baroneza", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(faturas.router, prefix="/api")
app.include_router(monthly.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
