from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from dotenv import load_dotenv

from app.api.endpoints import auth, tests, sessions, attempts, equipment, proctoring, certificates, reports, admin
from app.models.models import Base
from app.db.session import engine

load_dotenv()

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("🚀 Tables created successfully")
    yield
    # Shutdown logic here if needed

app = FastAPI(title="YouTestMe API", version="1.0.0", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(tests.router, prefix="/api/tests", tags=["tests"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(attempts.router, prefix="/api/attempts", tags=["attempts"])
app.include_router(equipment.router, prefix="/api/equipment", tags=["equipment"])
app.include_router(proctoring.router, prefix="/api/proctoring", tags=["proctoring"])
app.include_router(certificates.router, prefix="/api/certificates", tags=["certificates"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])

@app.get("/")
async def root():
    return {"message": "YouTestMe API is running..."}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)

