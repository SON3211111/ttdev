# Python으로 만든 AI 요청 중계 서버입니다. Java 백엔드가 질문을 보내면 Ollama에 전달하고 답변을 돌려줍니다.
# FastAPI는 HTTP 주소를 만드는 도구, Ollama는 실제 AI 모델을 실행하는 프로그램입니다.
# 현재는 일반 답변 생성만 지원합니다. 메모 저장, 임베딩(검색용 숫자 변환), 기록 검색은 아직 구현 전입니다.

import os

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="AI Server")

# os.getenv는 실행 환경에서 설정값을 읽습니다. 설정이 없으면 두 번째 인수의 기본값을 사용합니다.
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
AI_MODEL = os.getenv("AI_MODEL", "qwen2.5:1.5b")


class GenerateRequest(BaseModel):
    # BaseModel은 요청 JSON의 모양을 검사합니다. /generate는 {"prompt": "질문"}을 받습니다.
    prompt: str


@app.get("/")
def home():
    return {"message": "AI Server Running"}


@app.get("/health")
def health():
    # 이 주소가 응답하면 Python 서버가 살아 있다는 뜻입니다. Ollama나 모델까지 호출해 보는 검사는 아닙니다.
    return {"status": "ok"}


@app.post("/generate")
async def generate(request: GenerateRequest):
    try:
        # async/await는 다른 서버의 응답을 기다리는 동안 Python이 다른 요청도 처리할 수 있게 합니다.
        # async with 블록을 벗어나면 HTTP 연결 도구가 정리됩니다. 아래 timeout은 HTTP 통신 대기 제한입니다.
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": AI_MODEL,
                    # system은 모델에게 줄 기본 지시입니다. prompt는 사용자의 질문입니다.
                    # 한국어 응답을 요청하지만 모델이 지시를 어길 수 있으므로 품질 검증은 별도로 필요합니다.
                    "system": (
                        "항상 한국어로 답하세요. "
                        "질문이 영어 등 다른 언어여도 답변은 한국어로 작성하세요. "
                        "다른 언어는 사용자가 명시적으로 요청한 경우에만 사용하세요."
                        " Respond in Korean even when the question is in English, "
                        "unless the user explicitly requests another response language."
                    ),
                    "prompt": request.prompt,
                    # stream=False는 답변을 조금씩 받지 않고 완성된 답변 하나를 받겠다는 뜻입니다.
                    "stream": False
                }
            )

            # 4xx/5xx 실패 응답이면 예외를 냅니다. 성공한 경우에만 JSON에서 답변을 꺼냅니다.
            response.raise_for_status()
            # Ollama의 전체 응답에서 프론트에 필요한 모델 이름과 답변 본문만 전달합니다.
            result = response.json()

            return {
                "model": AI_MODEL,
                "response": result.get("response", "")
            }

    except httpx.HTTPError as e:
        # Ollama 호출 실패를 HTTP 502(다음 서버에서 응답을 정상적으로 받지 못함)로 바꿉니다.
        raise HTTPException(
            status_code=502,
            detail=f"Ollama connection failed: {str(e)}"
        )
