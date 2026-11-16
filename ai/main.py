
import os

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="AI Server")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
AI_MODEL = os.getenv("AI_MODEL", "qwen2.5:1.5b")


class GenerateRequest(BaseModel):
    prompt: str


@app.get("/")
def home():
    return {"message": "AI Server Running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate")
async def generate(request: GenerateRequest):
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": AI_MODEL,
                    "prompt": request.prompt,
                    "stream": False
                }
            )

            response.raise_for_status()
            result = response.json()

            return {
                "model": AI_MODEL,
                "response": result.get("response", "")
            }

    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Ollama connection failed: {str(e)}"
        )
