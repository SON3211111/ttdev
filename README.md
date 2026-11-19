# MEMORIA

일기·빠른 메모·약속·할 일을 관리하는 로컬 단일 사용자 기록 서비스입니다.

2026-11-18 기준 홈에서 기록을 남기고 **앞으로 7일**의 약속과 마감할 일을 볼 수 있습니다. **기록** 메뉴에는 전체 메모·일기가 있고, **캘린더**에서는 날짜별 기록·약속·할 일이 팝업으로 열립니다. **일정 관리**에서는 할 일 상태와 변경 이력, 대시보드를 확인할 수 있습니다. **메모리아에 물어보기**는 화면 미리보기 단계입니다.

캘린더의 날짜 칸은 마감일 기준으로 미완료 **할 일**과 **완료한 일**의 건수를 구분합니다. 날짜 팝업에서 각 할 일의 상태를 확인할 수 있습니다.

## 실행

Docker Desktop(Docker Compose 포함)을 실행한 뒤 프로젝트 루트의 PowerShell에서 진행합니다.

~~~powershell
Copy-Item .env.example .env
# .env의 두 비밀번호를 로컬용 값으로 바꾼 뒤 실행합니다.
docker compose up -d --build
docker compose ps
~~~

이미 .env가 있으면 복사로 덮어쓰지 말고 기존 설정을 사용합니다. 기존 MySQL 볼륨이 있으면 초기 비밀번호를 바꾸는 것만으로 DB 계정 비밀번호가 변경되지 않습니다.

브라우저에서 http://localhost:5173 을 엽니다. 백엔드는 8080, AI 서버는 8000 포트를 사용합니다. MySQL은 Compose 설정상 localhost:5506이며 실제 실행 포트는 docker compose ps로 확인합니다. 기본 스택은 React/TypeScript/Vite, Java 17/Spring Boot/JPA/Flyway, MySQL 8, FastAPI, Ollama, Qdrant입니다.

Qdrant 대시보드는 http://127.0.0.1:16333/dashboard 에서 열 수 있습니다. Compose 내부에서 AI 서버는 `http://qdrant:6333`으로 접속합니다.

DB 구조는 백엔드 시작 시 Flyway가 V1(records)·V2(schedules)·V3(tasks, task_transitions)를 적용하고 JPA가 검증합니다. 이미 적용한 SQL은 수정하지 않습니다. 로컬 DB 볼륨을 삭제하면 기록이 사라지므로 데이터 보존 시 docker compose down -v를 실행하지 않습니다.

~~~powershell
# Java 변경 반영
docker compose up -d --build --no-deps backend
# 데이터 볼륨을 유지한 채 중지
docker compose stop
~~~

프론트 소스는 바인드 마운트로 반영됩니다. 프론트 의존성이 변경되면 컨테이너의 node_modules도 갱신해야 합니다. 현재 Vite 개발 프록시는 Docker 내부 backend:8080을 사용하므로 위 Docker 경로가 기본 실행 방법입니다.

## 검증

Node/npm과 Java 17이 설치된 로컬 환경에서 실행합니다.

~~~powershell
Push-Location frontend
npm.cmd ci
npm.cmd run lint
npm.cmd run build
Pop-Location
Push-Location backend
.\gradlew.bat test bootJar --no-daemon
Pop-Location
~~~

Gradle 사용자 캐시에 쓰기 권한이 필요합니다. 백엔드 테스트는 H2를 사용합니다. 실제 MySQL과 브라우저 검증 결과는 [HANDOFF.md](docs/HANDOFF.md)에 기록했습니다.

실행 중인 서비스의 브라우저 검증은 Playwright와 Edge를 사용합니다. Playwright를 별도 설치했다면 PLAYWRIGHT_MODULE_PATH에 그 패키지 경로를 지정합니다.

~~~powershell
node scripts/verify-query-ui.cjs
node scripts/verify-records-ui.cjs
node scripts/verify-diary-ui.cjs
node scripts/verify-calendar-ui.cjs
node scripts/verify-tasks-ui.cjs
node scripts/verify-stage3-ui.cjs
node scripts/verify-schedule-editor-ui.cjs
node scripts/verify-schedules-ui.cjs
node scripts/verify-schedules-runtime.cjs
~~~

query-ui, diary-ui, schedule-editor-ui는 모의 응답으로 조회·편집 상태를 검사합니다. records-ui와 stage3-ui는 메모·일기 관리, calendar-ui는 날짜별 팝업과 작성·상세, tasks-ui는 할 일과 집계, schedules-ui는 약속 관리를 확인합니다. 실제 DB에 생성한 검증 데이터는 실행을 마치면 정리합니다. schedules-runtime은 AI를 잠시 중단하고 MySQL과 백엔드를 재시작하므로 Docker 접근 권한이 필요합니다.

## AI 환경

메모·일기·약속·할 일 저장과 조회는 AI 응답을 기다리지 않습니다. PENDING은 원문이 저장됐고 검색 인덱스 준비가 남아 있는 상태입니다. AI는 연결·생성 테스트를 지원하며, **메모리아에 물어보기**의 답변과 출처 연결은 후속 개발입니다.

~~~powershell
docker compose exec ollama ollama pull qwen2.5:1.5b
docker compose exec ollama ollama pull bge-m3
~~~

모델 다운로드와 초기 환경 검증은 [ENVIRONMENT_CHECK.md](docs/ENVIRONMENT_CHECK.md)를 참고합니다. 모델 파일·개인 기록·비밀값은 GitHub에 올리지 않습니다. 현재 구성은 로컬 개발용이며 인증·공개 배포·다중 사용자는 지원하지 않습니다.

## 문서

- [현재 상태와 다음 작업](docs/HANDOFF.md)
- [기획서](docs/PROJECT_PLAN.md) / [80시간 개발 계획](docs/DEVELOPMENT_PLAN.md)
- [API](docs/API.md) / [상세 데이터·오류 규칙](docs/MINIMUM_DESIGN.md)
- [메모 검증](docs/STAGE2_CHECK.md) / [일정 검증](docs/STAGE4_CHECK.md)

오늘 포함 7일 범위 밖의 일정과 완료·취소 일정은 캘린더에서 해당 날짜를 선택해 열 수 있습니다.
