# AI 컨테이너 안에서 실행하는 연결 점검입니다. Qdrant의 컬렉션은 벡터를 모아 두는 공간으로 DB 테이블과 비슷합니다.
# 임시 컬렉션에 예시 문장 2개를 넣고 질문으로 찾은 뒤 삭제합니다. 실제 메모나 기존 컬렉션은 건드리지 않습니다.
# 이 작은 검사는 연결이 되는지만 확인합니다. 다양한 한국어 질문에 대한 품질 평가는 별도로 필요합니다.
"""Run inside the AI container: docker compose exec -T ai python < this_file.

Uses a unique disposable Qdrant collection; never touches application records.
This is an environment smoke check, not a retrieval-quality benchmark.
"""

import json
import os
import time
import uuid

import httpx


def main():
    ollama = os.getenv("OLLAMA_URL", "http://ollama:11434")
    qdrant = os.getenv("QDRANT_URL", "http://qdrant:6333")
    model = os.getenv("EMBEDDING_MODEL", "bge-m3")
    # UUID로 매번 다른 이름을 만들어 기존 데이터와 겹치지 않게 합니다.
    collection = "stage0_probe_" + uuid.uuid4().hex
    # 한글을 \uXXXX로 적어 PowerShell에서 파이프로 넘길 때 글자가 깨지지 않게 합니다.
    # 내용은 '민수와 카페 방문/빌린 책 반환 약속', '혼자 공원 운동', 질문은 '민수에게 돌려줄 물건'입니다.
    texts = [
        "\ubbfc\uc218\uc640 \ub3d9\uc131\ub85c \uce74\ud398\uc5d0 \uac14\ub2e4. \ub2e4\uc74c\uc5d0 \ube4c\ub9b0 \ucc45\uc744 \ub3cc\ub824\uc8fc\uae30\ub85c \ud588\ub2e4.",
        "\uc624\ub298 \ud63c\uc790 \uacf5\uc6d0\uc5d0\uc11c \uc6b4\ub3d9\uc744 \ud588\ub2e4.",
    ]
    question = "\ubbfc\uc218\uc5d0\uac8c \ub3cc\ub824\uc904 \ubb3c\uac74\uc774 \ubb50\uc600\uc9c0?"
    start = time.perf_counter()
    created = False
    with httpx.Client(timeout=180.0) as client:
        def request(method, url, **kwargs):
            # 공통 요청 도우미입니다. HTTP 실패 응답이면 즉시 예외를 내고, 성공하면 JSON을 읽습니다.
            response = client.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()

        request("GET", "http://ai:8000/health")
        request("GET", qdrant + "/collections")
        # 임베딩은 문장의 의미를 숫자 배열로 바꾸는 작업입니다. 문장 2개와 질문 1개, 총 3개를 변환합니다.
        # keep_alive=0은 처리 후 모델을 내리도록 요청해 다음 생성 모델을 위한 메모리를 비웁니다.
        vectors = request("POST", ollama + "/api/embed", json={
            "model": model, "input": texts + [question], "keep_alive": 0,
        })["embeddings"]
        assert len(vectors) == 3 and len(vectors[0]) > 0
        # 차원(dimension)은 벡터 하나에 들어 있는 숫자 개수입니다. 문장과 질문의 차원이 같아야 비교할 수 있습니다.
        dimension = len(vectors[0])
        assert all(len(vector) == dimension for vector in vectors)
        try:
            request("PUT", qdrant + "/collections/" + collection, json={
                "vectors": {"size": dimension, "distance": "Cosine"},
            })
            created = True
            request("PUT", qdrant + "/collections/" + collection + "/points?wait=true", json={
                "points": [
                    {"id": i + 1, "vector": vector, "payload": {"text": text}}
                    for i, (text, vector) in enumerate(zip(texts, vectors[:2]))
                ],
            })
            # 질문 벡터와 비슷한 문장을 찾습니다. 책 약속이 있는 첫 문장(ID=1)이 먼저 나와야 합니다.
            matches = request("POST", qdrant + "/collections/" + collection + "/points/search", json={
                "vector": vectors[2], "limit": 2, "with_payload": True,
            })["result"]
            assert matches and matches[0]["id"] == 1, "Unexpected top sample"
            embedding_seconds = round(time.perf_counter() - start, 2)
            generation_start = time.perf_counter()
            # 프론트 주소로 질문을 보내 Vite 전달 → Java → Python → Ollama 연결을 한 번에 검사합니다.
            generated = request("POST", "http://frontend:5173/api/ai/generate", json={
                "prompt": "Reply with only OK.",
            }, headers={"Host": "localhost:5173"})
            assert generated.get("response", "").strip(), "Empty generation"
            print(json.dumps({
                "status": "PASS", "embedding_model": model,
                "dimension": dimension, "sample_top_id": matches[0]["id"],
                "sample_scores": [round(item["score"], 4) for item in matches],
                "embedding_store_search_seconds": embedding_seconds,
                "generation_model": generated.get("model"),
                "generation_response": generated["response"],
                "generation_seconds": round(time.perf_counter() - generation_start, 2),
            }))
        # finally는 중간 검사에서 실패해도 실행됩니다. created가 참일 때 이 실행의 임시 컬렉션만 삭제합니다.
        finally:
            if created:
                request("DELETE", qdrant + "/collections/" + collection)


if __name__ == "__main__":
    main()
