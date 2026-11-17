# MEMORIA 프론트엔드

React·TypeScript·Vite 기반 홈 화면입니다. 메모/일기 CRUD, 기록 목록·캘린더, 일정 CRUD·다가오는 일정이 연결되어 있습니다. 일반 기록 검색은 제거했고 AI 기억 검색/약속 준비는 연결 전입니다.

기본 실행은 루트의 Docker Compose를 사용합니다. 프론트는 http://localhost:5173 에서 열며 /api를 Docker 내부 backend:8080으로 전달합니다. 소스는 바인드 마운트로 반영됩니다.

~~~powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run build
~~~

주요 흐름은 pages/HomePage.tsx → components/home의 입력/목록/상세 → api/records.ts·schedules.ts → 공통 request.ts → 백엔드입니다. 날짜는 utils/date.ts에서 서울 기준으로 처리합니다. 저장 실패 입력 보존과 저장 성공/조회 실패 분리를 유지합니다.

실행 설정·환경변수·브라우저 검증은 [루트 README](../README.md), 현재 범위는 [HANDOFF](../docs/HANDOFF.md)를 따릅니다.

다음 5단계는 캘린더에서 미래 날짜를 선택해 일정을 미리 등록하고 조회·수정·삭제·상태 변경하는 흐름입니다. 홈은 다가오는 일정 확인용으로 유지하며 별도 일정 관리 탭을 복원하지 않습니다. 현재 캘린더는 기록만 표시합니다.

일기 작성은 DiaryForm.tsx/DiaryForm.css의 전용 카드로 표시합니다. 작성 중에는 빠른 메모를 숨기되 컴포넌트와 초안은 유지합니다. verify-diary-ui.cjs는 모의 API로 반응형과 입력 보존·저장 상태를, verify-stage3-ui.cjs는 실제 일기 CRUD를 검증합니다.
