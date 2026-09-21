from fastapi import FastAPI

from app.api.routes import connections, messages

app = FastAPI(title="Connection App API")
app.include_router(connections.router)
app.include_router(messages.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


    # app/main.py — add before app.include_router calls
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite's default dev port; add your deployed frontend origin later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
