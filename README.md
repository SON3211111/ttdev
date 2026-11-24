# t&tech

팀 업무와 개인 업무를 캘린더에서 관리하고 일일·주간회의와 주간 업무보고를 작성하는 사내 업무 서비스입니다.

## 실행

Docker Desktop(Docker Compose 포함)을 실행한 뒤 프로젝트 루트의 PowerShell에서 진행합니다.

~~~powershell
Copy-Item .env.example .env
# .env에 MSSQL_SA_PASSWORD를 설정한 뒤 실행합니다.
docker compose up -d --build
docker compose ps
~~~

이미 .env가 있으면 파일을 유지하고 `MSSQL_SA_PASSWORD`를 추가합니다. SQL Server 비밀번호는 8자 이상이며 대문자, 소문자, 숫자, 특수문자 중 세 종류 이상을 포함해야 합니다. 기존 SQL Server 볼륨에 설정된 비밀번호는 .env만 수정해도 바뀌지 않습니다.

브라우저에서 http://localhost:5173 을 엽니다. 호스트에서 백엔드는 `127.0.0.1:18080`으로 접속합니다. Compose 내부에서는 `http://backend:8080`을 사용하며 SQL Server Express도 내부에서 접근합니다. 기본 스택은 React/TypeScript/Vite, Next.js, SQL Server Express입니다.

백엔드는 처음 연결할 때 `appdb`에 [t&tech 스키마](docs/ERD.md)를 적용합니다. Compose에 포함된 `sa` 연결은 로컬 개발 설정입니다. 데이터를 보존하려면 `docker compose stop`으로 중지합니다.

~~~powershell
# Next.js 백엔드 변경 반영
docker compose up -d --build --remove-orphans --no-deps backend
# 데이터 볼륨을 유지한 채 중지
docker compose stop
~~~

프론트 소스는 바인드 마운트로 반영됩니다. 프론트 의존성이 변경되면 컨테이너의 node_modules도 갱신해야 합니다. 현재 Vite 개발 프록시는 Docker 내부 backend:8080을 사용하므로 위 Docker 경로가 기본 실행 방법입니다.

## 검증

기본 주소에는 t&tech 사내 홈이 열립니다. 워크스페이스를 누르면 로그인 또는 팀·개인 공간 목록으로 이동합니다. 처음 설치할 때는 **처음 설정하기**에서 이름·이메일·비밀번호를 등록해 회사 소속 대표 계정을 만듭니다. 관리자는 조직 관리에서 팀(기술영업 1·2팀, 서울지사, 솔루션개발 1·2팀, 경영지원팀, 기업부설연구소)을 지정해 팀장·팀원을 초대하고, 팀장은 워크스페이스의 **새 팀원 초대**로 자기 팀원을 초대합니다. 초대받은 사람은 **초대받아 가입**에서 링크를 입력하거나 직접 열어 가입합니다. 권한과 직급은 초대에서 정해집니다. 팀장은 부서마다 1명이라 팀장으로 초대받은 경우에만 팀장이 되고, 대표·본부장은 회사에 각각 1명입니다. 초대 링크는 7일 동안 한 번만 쓸 수 있습니다. 기존 계정 이전과 본부장 겸임은 [권한 문서](docs/PERMISSIONS.md)를 참고합니다.

현재 Compose는 로컬 개발용입니다. 운영에서는 빌드한 프론트와 API를 같은 HTTPS 주소로 제공하고 실제 웹 주소를 `TEAM_ORIGIN`에 지정합니다. `TEAM_SECURE_COOKIE=true`에서는 설정한 HTTPS 출처의 쓰기 요청만 허용합니다. 새 설치를 열기 전에 운영자용 `TEAM_SETUP_TOKEN`을 설정합니다. 처음 설정을 마치면 이 값을 제거할 수 있습니다.

운영 SQL Server는 별도 계정으로 마이그레이션한 다음, 최소 권한 앱 계정의 `SQLSERVER_USER`·`SQLSERVER_PASSWORD`와 `SQLSERVER_AUTO_MIGRATE=false`를 적용합니다. 신뢰할 수 있는 서버 인증서를 설치하고 `SQLSERVER_TRUST_CERTIFICATE=false`를 사용합니다.

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

실행 중인 서비스의 통합 검증에는 계정이 없는 격리 데이터베이스를 사용합니다. 스크립트마다 별도 DB를 사용하고 `TEAM_VERIFY_URL`에 각 서버의 `http://127.0.0.1:18xxx` 주소를 지정합니다. UI 검증은 `http://localhost:5173`에서 프론트를 열고 팀 API 요청을 격리 서버로 보냅니다. Edge와 Playwright가 필요하며, Playwright를 별도 설치했다면 `PLAYWRIGHT_MODULE_PATH`로 패키지 경로를 지정합니다.

~~~powershell
node scripts/verify-team.mjs
node scripts/verify-team-ui.cjs
~~~

## 향후 t&tech AI 기능

Compose는 FastAPI AI 서버, 모델 실행용 Ollama, 검색용 Qdrant도 실행합니다. AI 서버는 로컬 `127.0.0.1:18000`, Qdrant는 `127.0.0.1:16333`, Ollama는 `127.0.0.1:11434`에서 접근할 수 있습니다. t&tech 업무 데이터와 화면 연동은 후속 범위입니다.

모델이 준비되면 아래 명령으로 답변 생성, 임베딩, 임시 Qdrant 컬렉션의 검색을 점검할 수 있습니다.

~~~powershell
docker compose exec ollama ollama pull qwen2.5:1.5b
docker compose exec ollama ollama pull bge-m3
Get-Content -LiteralPath 'scripts/verify-ai-environment.py' -Raw | docker compose exec -T ai python -
~~~

## 문서

- [현재 상태와 다음 작업](docs/HANDOFF.md)
- [팀 업무 기획과 로드맵](docs/PROJECT_PLAN.md) / [업무관리 캘린더 요구사항](docs/업무관리캘린더/업무관리%20캘린더%20요구사항.md)
- [현재 API](docs/API.md) / [현재 DB 구조](docs/ERD.md)
