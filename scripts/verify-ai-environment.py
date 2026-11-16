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
    collection = "stage0_probe_" + uuid.uuid4().hex
    # Escape Unicode so the probe also works through Windows PowerShell pipes.
    texts = [
        "\ubbfc\uc218\uc640 \ub3d9\uc131\ub85c \uce74\ud398\uc5d0 \uac14\ub2e4. \ub2e4\uc74c\uc5d0 \ube4c\ub9b0 \ucc45\uc744 \ub3cc\ub824\uc8fc\uae30\ub85c \ud588\ub2e4.",
        "\uc624\ub298 \ud63c\uc790 \uacf5\uc6d0\uc5d0\uc11c \uc6b4\ub3d9\uc744 \ud588\ub2e4.",
    ]
    question = "\ubbfc\uc218\uc5d0\uac8c \ub3cc\ub824\uc904 \ubb3c\uac74\uc774 \ubb50\uc600\uc9c0?"
    start = time.perf_counter()
    created = False
    with httpx.Client(timeout=180.0) as client:
        def request(method, url, **kwargs):
            response = client.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()

        request("GET", "http://ai:8000/health")
        request("GET", qdrant + "/collections")
        vectors = request("POST", ollama + "/api/embed", json={
            "model": model, "input": texts + [question], "keep_alive": 0,
        })["embeddings"]
        assert len(vectors) == 3 and len(vectors[0]) > 0
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
            matches = request("POST", qdrant + "/collections/" + collection + "/points/search", json={
                "vector": vectors[2], "limit": 2, "with_payload": True,
            })["result"]
            assert matches and matches[0]["id"] == 1, "Unexpected top sample"
            embedding_seconds = round(time.perf_counter() - start, 2)
            generation_start = time.perf_counter()
            # Exercises Vite proxy -> Spring Boot -> FastAPI -> Ollama.
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
        finally:
            if created:
                request("DELETE", qdrant + "/collections/" + collection)


if __name__ == "__main__":
    main()
