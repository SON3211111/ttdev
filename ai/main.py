
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
                    "system": (
                        "항상 한국어로 답하세요. "
                        "질문이 영어 등 다른 언어여도 답변은 한국어로 작성하세요. "
                        "다른 언어는 사용자가 명시적으로 요청한 경우에만 사용하세요."
                        " Respond in Korean even when the question is in English, "
                        "unless the user explicitly requests another response language."
                    ),
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
