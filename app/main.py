from fastapi import FastAPI

from app.api.routes import connections, messages

app = FastAPI(title="Connection App API")
app.include_router(connections.router)
app.include_router(messages.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
