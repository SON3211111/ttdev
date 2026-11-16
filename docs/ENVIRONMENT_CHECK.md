# 0단계 환경 점검 결과

점검일: 2026-11-16 (Asia/Seoul)
결과: **0단계 통과 — 기본 연결 및 샘플 처리 검증 완료**

## 확인 결과

| 항목 | 결과 | 근거 |
|---|---|---|
| Docker Engine | 통과 | 29.9.3 |
| 서비스 실행 | 통과 | mysql/backend/frontend/ai/ollama/qdrant 실행 |
| 프론트 응답 | 통과 | localhost:5173 HTTP 200 |
| 프론트 프록시→백엔드→FastAPI→Ollama | 통과 | /api/ai/generate에서 qwen2.5:1.5b의 OK 응답 |
| FastAPI | 통과 | /health status=ok |
| Spring Boot→MySQL | 통과 | Hikari의 MySQL 연결 추가·시작 성공 로그 |
| MySQL 재시작 데이터 유지 | 통과 | 고유 임시 테이블에 marker 저장, mysql 재시작·healthy 확인 후 동일 marker 읽음 |
| 임베딩 | 통과 | bge-m3, 1024차원, 한국어 문장·질문 3건 |
| Qdrant 저장·검색 | 통과 | 고유 임시 컬렉션의 두 기록 중 예상 기록 1위 |
| 점검 데이터 정리 | 완료 | MySQL 임시 테이블·Qdrant 임시 컬렉션 삭제 |

DB 테스트는 appuser 계정으로 수행했다. 업무용 테이블이나 DB 볼륨은 삭제하지 않았다. 재시작은 MySQL 컨테이너에 수행했으며 전체 Compose 삭제/재생성을 검증한 것은 아니다. 아직 업무 DB API가 없으므로 백엔드의 실제 업무 쿼리는 미검증이다. 브라우저 클릭 자동화 대신 HTTP와 프록시 경로를 검증했다.

## 변경 내용

- 중지돼 있던 AI 컨테이너 시작.
- docker-compose.yml에 Qdrant·영속 볼륨 추가. 포트는 127.0.0.1:6333으로 제한.
- AI 환경변수 EMBEDDING_MODEL=bge-m3, QDRANT_URL=http://qdrant:6333 추가. 해당 변수는 점검 스크립트에서 사용하며 업무용 임베딩 API는 아직 없다.
- Ollama에 bge-m3 임베딩 모델 다운로드(약 1.2GB). 기존 qwen2.5:1.5b 유지.
- scripts/verify-ai-environment.py 추가.

## 측정

최종 샘플 실행:

- 임베딩·저장·검색: 3.05초
- 검색 점수: 예상 기록 0.6921, 다른 기록 0.3052
- 전체 프록시 경유 생성: 3.53초, 응답 OK

두 개 기록만 사용하는 연결 점검이다. 한국어 전반의 검색 품질, RAG 정확도, 긴 원문, 동시 요청, 지속 부하나 콜드 스타트 성능을 입증하지 않는다. bge-m3는 환경 점검에 성공한 초기 후보이며 최종 품질 평가는 별도 수행한다.

## 재실행

프로젝트 루트의 PowerShell에서 실행한다. Docker 접근 권한이 필요하다.

```powershell
docker compose up -d
docker compose exec ollama ollama pull qwen2.5:1.5b
docker compose exec ollama ollama pull bge-m3
Get-Content -LiteralPath 'scripts/verify-ai-environment.py' -Raw | docker compose exec -T ai python -
```

PASS와 dimension=1024, sample_top_id=1을 확인한다. 스크립트는 고유 컬렉션만 생성·정리한다. Vite 내부 접근 시 Host를 localhost:5173으로 지정해 브라우저 접근 호스트를 재현한다. 임베딩 모델은 샘플 처리 후 언로드하도록 요청해 기존 단일 모델 로딩 설정과 함께 생성 모델을 순차 사용한다.

## 다음 단계

1단계 최소 설계: Record/Schedule 데이터와 API 계약, 날짜·시간 정책, 입력 제한, DB 스키마 관리, 첫 화면 흐름 확정. 일기·메모·일정 등 서비스 기능은 여전히 미구현이다.
