# MEMORIA 인수인계

최종 갱신: 2026-11-18 (Asia/Seoul)

## 현재 상태

로컬 단일 사용자 MVP에서 메모·일기, 약속, 통합 캘린더, 할 일 관리와 대시보드를 구현했다. 다음 개발은 6단계 AI 검색 인덱스 준비다. 기존 개발 예산은 평일 10일 × 8시간이다. 캘린더 이후 추가한 할 일 관리와 대시보드의 실제 소요 시간 및 변경 일정은 별도로 산정하지 않았다.

| 화면 | 사용 흐름 |
|---|---|
| 홈 | 오늘 날짜와 빠른 메모·일기 작성. **앞으로 7일**에는 서울 기준 오늘~6일 후의 예정 약속과 해당 기간에 마감하는 미완료 할 일을 날짜순으로 표시. 기한이 지난 할 일은 건수로 표시 |
| 기록 | 상단 **기록**에서 전체 메모·일기 목록을 열고 종류별로 조회. 상세에서 원문·수정·삭제 |
| 캘린더 | 날짜 칸에서 마감일 기준으로 미완료 `할 일`과 `완료한 일` 건수를 구분. 날짜 팝업에서 메모·일기·약속·할 일과 상태를 확인. 약속 추가·수정·삭제, 오늘·과거 날짜의 메모·일기 작성, 할 일 상세 이동 |
| 일정 관리 | 할 일 등록·수정·삭제, 상태별 목록, 마감일과 변경 이력. 상세의 **하기 전 / 하는 중 / 완료** 버튼으로 원하는 상태로 이동. `#tasks`에서 새로고침해도 일정 관리 화면을 유지하며 브라우저 뒤로가기·앞으로가기를 지원 |
| 내 일정 한눈에 | 일정 관리 제목 바로 아래에 표시. **내 일정, 지금은** 진행 상태 도넛, **일주일 안에 끝낼 일**, **지난 일주일에 끝낸 일** 순서. 두 주간 그래프는 제목 바로 아래에 합계를 표시 |
| 물어보기 | 홈의 **메모리아에 물어보기** 질문 미리보기. 답변과 출처 연결은 후속 작업 |

## 데이터와 변경 규칙

- 메모·일기는 서울 기준 오늘과 과거 기록을 저장한다. 날짜·제목·본문 변경 시 원문 버전이 증가하고 검색 상태가 PENDING으로 바뀐다. 목록은 기록 날짜·작성 시각·ID 내림차순이며 일반 키워드 검색은 제외됐다.
- 약속은 과거·미래 날짜를 모두 지원하고 시간·장소·메모는 선택이다. 예정·완료·취소 상태를 사용자 입력으로 변경한다. 홈의 약속 조회는 7일 동안의 예정 상태만 대상으로 한다.
- 할 일은 마감일이 지난 미완료 상태에서 지연으로 집계한다. 마감일이 있는 할 일은 모든 상태가 캘린더에 표시된다. 완료에서 다른 상태로 바꾸면 완료 시각을 비우며, 같은 상태를 다시 요청하면 변경 이력을 추가하지 않는다.
- 원문 저장·조회는 AI의 실행 상태와 독립적이다. MySQL은 원본 저장소이고 Qdrant는 향후 재생성할 수 있는 인덱스로 사용한다.
- Flyway V1 `records`, V2 `schedules`, V3 `tasks`·`task_transitions`를 사용한다. 로컬의 `[예시]`·`[예시 추이]` 데이터는 화면과 집계 연습용이다.
- 현재 계약은 [API.md](API.md), 데이터 규칙은 [MINIMUM_DESIGN.md](MINIMUM_DESIGN.md)에 정리했다.

## 검증

- 화면 전환을 브라우저 방문 기록에 연결한 뒤 lint와 build를 통과했다. Edge 390px에서 일정 관리 진입, 새로고침, 홈으로 뒤로가기, 일정 관리로 앞으로가기, `#tasks` 직접 접속을 확인했다.
- 두 주간 그래프의 합계가 Edge 1280px·390px에서 API 응답과 일치했다. 대시보드의 기한 경과 줄을 제거한 뒤 lint와 build를 통과했고, Edge 390px에서 두 합계와 해당 줄 제거를 확인했다.
- 일정 관리 대시보드 배치 변경 후 lint와 build를 통과했다. Edge 1280px·390px에서 대시보드가 목록과 작성 폼 위에 배치되고 **내 일정, 지금은** 그래프가 대시보드 맨 앞에 표시되는지 확인했다.
- 월간 캘린더의 완료 건수 구분 변경 후 프론트 lint와 build를 통과했다. Edge에서 캘린더 할 일 API 응답을 모의 처리해 1280px와 390px에서 `할 일 2`·`완료한 일 1` 및 날짜 팝업의 `완료` 상태 표시를 확인했다.
- 프론트 `npm.cmd run lint`, `npm.cmd run build`; 백엔드 `gradlew.bat test bootJar --no-daemon` 사용. 백엔드 테스트는 H2에서 실행한다.
- 실제 Edge·MySQL 환경에서 기록 CRUD와 실패 입력 보존, 날짜별 캘린더 팝업, 약속 CRUD, 할 일 상태 직접 변경과 이력, 홈·캘린더·대시보드 갱신을 확인했다. 모바일 390px 검증과 모의 조회 실패·재시도 검증을 포함했다.
- 과거 실행 검증은 [환경 검증](ENVIRONMENT_CHECK.md), [메모 검증](STAGE2_CHECK.md), [일정 검증](STAGE4_CHECK.md), [11월 17일 이력](history/HANDOFF_2026-11-17.md)에서 확인할 수 있다.

## 다음 개발 작업

1. 기록 저장과 분리된 임베딩 인덱스 처리, 수정 버전 갱신, 삭제 반영과 실패 재처리를 구현한다. 삭제·수정 전 기록을 검색 근거에서 제외한다.
2. **메모리아에 물어보기**에서 메모·일기의 의미 검색과 약속·할 일의 MySQL 날짜·상태 조회를 연결한다. 답변에 출처를 붙이고 약속 준비에서 기록에 있는 사실과 AI 제안을 구분한다.

## 코드 작성과 디버깅 연습

| 흐름 | 먼저 볼 파일 | 확인할 내용 |
|---|---|---|
| 메모·일기 저장 | [HomePage](../frontend/src/pages/HomePage.tsx), [RecordService](../backend/src/main/java/com/example/backend/service/RecordService.java) | 입력과 저장 요청, 목록 갱신을 따라가기 |
| 캘린더 | [RecordCalendar](../frontend/src/components/home/RecordCalendar.tsx), [CalendarController](../backend/src/main/java/com/example/backend/controller/CalendarController.java) | 날짜 클릭, 월 조회, 팝업과 상세 이동 |
| 할 일 상태 변경 | [TasksPage](../frontend/src/pages/TasksPage.tsx), [TaskService](../backend/src/main/java/com/example/backend/service/TaskService.java) | 상태 요청, DB 저장, 이력과 집계 갱신 |
| 대시보드 집계 | [TaskDashboard](../frontend/src/components/tasks/TaskDashboard.tsx), [TaskRepository](../backend/src/main/java/com/example/backend/repository/TaskRepository.java) | 마감일 조건과 SQL 집계 결과를 실제 항목과 대조 |

실행은 [README](../README.md)를 따른다. GitHub 원격은 `SON3211111/ttdev`, 브랜치는 `main`이다. `.env`, 개인 기록, DB 볼륨, 빌드 결과, 루트의 빈 임시 `docker` 파일을 공유 대상에서 제외한다. 현재 알려진 한계는 자정 자동 갱신 없음, 동시 편집 시 마지막 저장 반영, 인증·공개 배포 미지원이다.
