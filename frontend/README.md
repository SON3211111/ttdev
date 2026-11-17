# MEMORIA 프론트엔드

React·TypeScript·Vite 기반 홈 화면입니다. 메모/일기 CRUD, 기록 목록·캘린더, 일정 CRUD·다가오는 일정·기간별 관리가 연결되어 있습니다. 일반 기록 검색은 제거했고 AI 기억 검색/약속 준비는 연결 전입니다.

기본 실행은 루트의 Docker Compose를 사용합니다. 프론트는 http://localhost:5173 에서 열며 /api를 Docker 내부 backend:8080으로 전달합니다. 소스는 바인드 마운트로 반영됩니다.

~~~powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run build
~~~

주요 흐름은 pages/HomePage.tsx → components/home의 입력/목록/상세 → api/records.ts·schedules.ts → 공통 request.ts → 백엔드입니다. 날짜는 utils/date.ts에서 서울 기준으로 처리합니다. 저장 실패 입력 보존과 저장 성공/조회 실패 분리를 유지합니다.

실행 설정·환경변수·브라우저 검증은 [루트 README](../README.md), 현재 범위는 [HANDOFF](../docs/HANDOFF.md)를 따릅니다.
