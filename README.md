# 나의 하루

팀 업무 공유와 일일·주간회의를 통합 캘린더에 연결하는 방향으로 전환 중입니다. 현재 실행 가능한 버전은 일기·빠른 메모·약속·할 일을 관리하는 로컬 단일 사용자 앱입니다.

2026-11-18 기준 홈에서 기록을 남기고 **앞으로 7일**의 약속과 마감할 일을 볼 수 있습니다. **기록** 메뉴에는 전체 메모·일기가 있고, **캘린더**에서는 날짜별 기록·약속·할 일이 팝업으로 열립니다. **일정 관리**에서는 할 일 상태와 변경 이력, 대시보드를 확인할 수 있습니다. **나의 하루에 물어보기**는 화면 미리보기 단계입니다.

캘린더의 날짜 칸은 마감일 기준으로 미완료 **할 일**과 **완료한 일**의 건수를 구분합니다. 날짜 팝업에서 각 할 일의 상태를 확인할 수 있습니다.

## 실행

Docker Desktop(Docker Compose 포함)을 실행한 뒤 프로젝트 루트의 PowerShell에서 진행합니다.

~~~powershell
Copy-Item .env.example .env
# .env에 MSSQL_SA_PASSWORD를 설정한 뒤 실행합니다.
docker compose up -d --build
docker compose ps
~~~

이미 .env가 있으면 파일을 유지하고 `MSSQL_SA_PASSWORD`를 추가합니다. SQL Server 비밀번호는 8자 이상이며 대문자, 소문자, 숫자, 특수문자 중 세 종류 이상을 포함해야 합니다. 기존 SQL Server 볼륨에 설정된 비밀번호는 .env만 수정해도 바뀌지 않습니다.

브라우저에서 http://localhost:5173 을 엽니다. 호스트에서 백엔드는 `127.0.0.1:18080`, AI 서버는 `127.0.0.1:18000`으로 접속합니다. Compose 내부 주소는 각각 `http://backend:8080`, `http://ai:8000`입니다. SQL Server Express 포트는 Compose 내부에서 접근합니다. 기본 스택은 React/TypeScript/Vite, Next.js, SQL Server Express, FastAPI, Ollama, Qdrant입니다.

Qdrant 대시보드는 http://127.0.0.1:16333/dashboard 에서 열 수 있습니다. Compose 내부에서 AI 서버는 `http://qdrant:6333`으로 접속합니다.

백엔드는 처음 연결할 때 `appdb`에 [SQL Server 초기 스키마](backend-next/schema.sql)를 적용합니다. Compose에 포함된 `sa` 연결은 로컬 개발 설정입니다. 데이터를 보존하려면 `docker compose stop`으로 중지합니다.

~~~powershell
# Next.js 백엔드 변경 반영
docker compose up -d --build --no-deps backend
# 데이터 볼륨을 유지한 채 중지
docker compose stop
~~~

프론트 소스는 바인드 마운트로 반영됩니다. 프론트 의존성이 변경되면 컨테이너의 node_modules도 갱신해야 합니다. 현재 Vite 개발 프록시는 Docker 내부 backend:8080을 사용하므로 위 Docker 경로가 기본 실행 방법입니다.

## 검증

기본 주소에는 t&tech 사내 홈이 열립니다. 워크스페이스를 누르면 로그인 또는 팀·개인 공간 목록으로 이동합니다. 처음 설치할 때는 **처음 설정하기**에서 이름·이메일·비밀번호와 소속 팀·직급을 골라 관리자 계정을 만듭니다(직급을 팀장으로 고르면 그 팀 팀장도 맡습니다). 관리자는 조직 관리에서 팀(기술영업 1·2팀, 서울지사, 솔루션개발 1·2팀, 경영지원팀, 기업부설연구소)을 지정해 팀장·팀원을 초대하고, 팀장은 워크스페이스의 **새 팀원 초대**로 자기 팀원을 초대합니다. 초대받은 사람은 **초대받아 가입**에서 링크를 입력하거나 링크를 직접 열고, 직급을 고릅니다. 팀장은 부서마다 1명이라 팀장으로 초대받은 경우에만 팀장이 되고, 대표·본부장은 회사에 각각 1명입니다. 초대 링크는 7일 동안 한 번만 쓸 수 있습니다. 조직 구조 이전에 설치한 경우 기존 팀장이 관리자 권한을 갖습니다.

현재 Compose는 로컬 개발용입니다. HTTPS 뒤에 배치할 때는 실제 웹 주소를 `TEAM_ORIGIN`에 지정하고 `TEAM_SECURE_COOKIE=true`로 설정합니다. 기존 개인 기능은 http://localhost:5173/#home, 이전 대시보드 시안은 http://localhost:5173/#landing 에서 확인합니다.

Node.js와 npm이 설치된 로컬 환경에서 실행합니다.

~~~powershell
Push-Location frontend
npm.cmd ci
npm.cmd run lint
npm.cmd run build
Pop-Location
Push-Location backend-next
npm.cmd ci
npm.cmd test
npm.cmd run build
Pop-Location
~~~

검증 결과는 [HANDOFF.md](docs/HANDOFF.md)에 기록합니다.

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
node scripts/verify-sqlserver-api.mjs
node scripts/verify-schedules-runtime.cjs
~~~

sqlserver-api는 비로그인 401을 확인한 뒤 로그인해서 검사합니다. 팀장이 없는 격리 서버(`VERIFY_BASE_URL=http://127.0.0.1:18xxx`)에서는 검증용 팀장을 만들고, 그 외에는 `VERIFY_EMAIL`·`VERIFY_PASSWORD`를 지정합니다. 기존 개인 화면 UI 검증 스크립트(records-ui 등)는 아직 로그인 단계를 넣지 않았습니다.

query-ui, diary-ui, schedule-editor-ui는 모의 응답으로 조회·편집 상태를 검사합니다. records-ui와 stage3-ui는 메모·일기 관리, calendar-ui는 날짜별 팝업과 작성·상세, tasks-ui는 할 일과 집계, schedules-ui는 약속 관리를 확인합니다. 실제 DB에 생성한 검증 데이터는 실행을 마치면 정리합니다. schedules-runtime은 AI를 잠시 중단하고 SQL Server와 백엔드를 재시작하므로 Docker 접근 권한이 필요합니다.

## AI 환경

메모·일기·약속·할 일 저장과 조회는 AI 응답을 기다리지 않습니다. PENDING은 원문이 저장됐고 검색 인덱스 준비가 남아 있는 상태입니다. AI는 연결·생성 테스트를 지원하며, **나의 하루에 물어보기**의 답변과 출처 연결은 후속 개발입니다.

~~~powershell
docker compose exec ollama ollama pull qwen2.5:1.5b
docker compose exec ollama ollama pull bge-m3
~~~

모델 다운로드 후 다음 명령으로 프록시 경유 생성과 샘플 임베딩·벡터 검색을 점검합니다.

~~~powershell
Get-Content -LiteralPath 'scripts/verify-ai-environment.py' -Raw | docker compose exec -T ai python -
~~~

결과에서 PASS, dimension=1024, sample_top_id=1을 확인합니다. 모델 파일·개인 기록·비밀값은 GitHub에 올리지 않습니다. 현재 구성은 로컬 개발용입니다. 팀 계정 로그인은 있지만 공개 배포는 지원하지 않습니다.

## 문서

- [현재 상태와 다음 작업](docs/HANDOFF.md)
- [팀 업무 기획과 로드맵](docs/PROJECT_PLAN.md) / [업무관리 캘린더 요구사항](docs/업무관리캘린더/업무관리%20캘린더%20요구사항.md)
- [현재 API](docs/API.md) / [현재 DB 구조](docs/ERD.md)

오늘 포함 7일 범위 밖의 일정과 완료·취소 일정은 캘린더에서 해당 날짜를 선택해 열 수 있습니다.
