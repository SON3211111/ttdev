# 나의 하루 현재 API

통합 캘린더와 개인 작업 관리의 API 계약이다. 브라우저는 /api 프록시를 사용하며 Next.js 백엔드는 호스트 127.0.0.1:18080, Compose 내부 backend:8080에서 접근한다. 기존 개인 기능(`/api/records`, `/api/schedules`, `/api/tasks`, `/api/calendar`, `/api/ai`)도 팀 계정 로그인 세션이 필요하며, 로그인하지 않으면 `401 UNAUTHORIZED`를 반환한다. 데이터에는 소유자 구분이 없어 로그인한 팀원은 모두 같은 기존 기록을 본다. `/api/health`는 공개한다.

## 기록

| Method | URL | 동작 |
|---|---|---|
| POST | /api/records | 메모·일기 등록, 201 + Location + 상세 |
| GET | /api/records | 전체/종류별 목록, 캘린더 기간 조회 |
| GET | /api/records/{id} | 상세, 200 |
| PUT | /api/records/{id} | 제목·본문·날짜 전체 수정, 종류 변경 불가 |
| DELETE | /api/records/{id} | 물리 삭제, 204 |

등록: recordType(MEMO/DIARY), content, recordDate 필수. title은 일기만 선택이다. 수정은 content, recordDate와 선택 title을 받는다. 제목 최대 100자, 본문 최대 10,000 UTF-16 코드 단위, 공백 본문 거부, 기록 날짜는 서울 오늘까지 허용한다. 본문의 앞뒤 공백은 제거하고 내부 공백과 줄바꿈은 유지한다. 빈 일기 제목은 null로 처리하며 메모에 빈 값이 아닌 제목을 보내면 400을 반환한다.

목록 조건: type 생략은 전체, MEMO/DIARY 지정 가능. page 기본 0, size 기본 20(1~100). 캘린더 start/end는 둘 다 지정하며 양끝 포함, type과 동시 사용 불가다. keyword/from/to는 제거했으므로 빈 값도 포함해 400이다. 정렬은 recordDate·createdAt·id 내림차순이며 임의 sort는 받지 않는다.

상세: id(문자열), recordType, title, content, recordDate, contentVersion, embeddingStatus, indexedVersion, createdAt, updatedAt. 목록은 content 대신 preview를 제공한다. 본문/제목/날짜 변경 시 버전 증가·PENDING, 동일 값 저장은 버전 유지다. 목록 응답은 items/page/size/totalElements/totalPages다.

## 일정

| Method | URL | 동작 |
|---|---|---|
| POST | /api/schedules | 등록, PLANNED 고정, 201 + Location + 상세 |
| GET | /api/schedules | 오늘 포함 7일의 예정 일정 목록 |
| GET | /api/schedules/{id} | 상세 |
| PUT | /api/schedules/{id} | 입력 필드와 상태 전체 수정 |
| DELETE | /api/schedules/{id} | 물리 삭제, 204 |

등록 필수: title(최대 100자), scheduleDate(1000-01-01~9999-12-31, 과거/미래 허용). 선택: scheduleTime(HH:mm, 초 단위 거부), location(최대 200자), description(최대 2,000자). 시간 null/빈 문자열은 미정이며 선택 문자열 공백은 null로 정리한다. 수정 시 status(PLANNED/COMPLETED/CANCELLED)를 반드시 보낸다. 상태를 자동 변경하지 않는다.

목록은 서울 오늘~6일 후 PLANNED로 고정한다. page 기본 0, size 기본 20(1~100). start/end/status 조건은 제거했으며 빈 값도 400이다. 정렬은 날짜 오름차순 → 시간 있는 일정 먼저/시간 오름차순 → ID 오름차순이다.

상세와 목록 항목은 id(문자열), title, scheduleDate, scheduleTime(HH:mm 또는 null), location, description, status, createdAt, updatedAt이다. 페이지 응답은 기록과 같다. 작성/수정 시각은 밀리초 정밀도의 UTC다.

## 통합 캘린더

| Method | URL | 동작 |
|---|---|---|
| GET | /api/calendar/schedules?month=2026-11 | 해당 월의 예정·완료·취소 일정 요약 |
| GET | /api/calendar/tasks?month=2026-11 | 해당 월에 마감일이 있는 할 일 요약 |
| GET | /api/records?start=2026-11-01&end=2026-11-30&page=0&size=100 | 해당 월의 메모·일기 요약 |

일정 월 조회는 `month` 하나만 받는다. 1000-01~9999-12의 `YYYY-MM` 형식을 지원하고 시작일과 마지막 날을 모두 포함한다. 결과는 날짜·시간·ID 순의 배열이며, 항목은 id, title, scheduleDate, scheduleTime, status다. 해당 월 일정이 없으면 빈 배열이다. 일정 상세와 변경은 기존 일정 CRUD API를 사용한다.

할 일 월 조회도 같은 `month` 형식을 사용하며 id, title, dueDate, status를 반환한다. 마감일이 있는 모든 상태의 항목을 포함한다. 화면에서는 메모·일기·일정·할 일을 날짜별로 함께 표시한다. 기록은 여러 페이지를 모두 모으며, 할 일 상세와 변경은 기존 Task API를 사용한다.

## 개인 작업과 대시보드

| Method | URL | 동작 |
|---|---|---|
| GET | /api/tasks | 작업 목록. `status` 선택, `page` 기본 0, 페이지당 20개 |
| GET | /api/tasks/focus | 미완료 작업 중 마감이 빠른 순 최대 3개 |
| GET | /api/tasks/dashboard | 전체·완료·하는 중·지연 건수, 최근 7일 완료 추이, 앞으로 7일 마감 분포 |
| POST | /api/tasks | 등록, 201 + Location. 기본 상태 TODO |
| GET / PUT / DELETE | /api/tasks/{id} | 상세 조회 / 내용 수정 / 작업과 상태 변경 이력 삭제 |
| PUT | /api/tasks/{id}/status | `{ "status": "TODO" }`처럼 원하는 상태를 지정한다. TODO·DOING·DONE 사이에서 바로 이동하며, 이미 같은 상태면 그대로 응답한다. |
| PUT | /api/tasks/{id}/reopen | 완료 취소. 완료 직전의 TODO 또는 DOING으로 복귀 |
| GET | /api/tasks/{id}/history | 상태 변경 이력, 최신 변경 먼저 |

화면 입력은 `title` 필수(100자), `description` 선택(2,000자), `dueDate` 선택이다. 기존 호출의 `priority` 필드는 API에서 계속 받는다. 생략한 생성 요청에서는 NORMAL, 수정 요청에서는 저장된 값을 사용한다. 응답에는 상태, 완료·생성·수정 시각과 현재 지연 여부가 포함된다. 목록은 마감일이 빠른 순이며, 같은 마감일은 최근 등록 순이다. 마감일이 없는 작업은 마지막에 표시한다. 완료 요청을 반복해도 완료 시각과 상태 이력은 그대로다.

대시보드는 `total`, `done`, `doing`, `overdue`, `trend: [{ date, count }]`, `upcomingDue: [{ date, count }]`를 반환한다. 마감일이 서울 기준 오늘보다 이른 미완료 작업을 지연으로 집계하므로 하는 중과 지연은 겹칠 수 있다. 두 그래프 모두 서울 기준 오늘을 포함하며, 해당 건이 없는 날은 0이다. `trend`는 오늘까지의 7일을, `upcomingDue`는 오늘부터 7일간 날짜별 마감하는 미완료 일정만 집계한다.

## 오류·제약

기록/일정은 code, message, fieldErrors 배열로 오류를 응답한다. 항목별 오류는 field/message를 포함한다.

| HTTP | code | 조건 |
|---|---|---|
| 400 | VALIDATION_ERROR | 필수값·길이·날짜 범위·상태·페이지 규칙 위반 |
| 400 | INVALID_REQUEST | JSON/날짜/ID 형식, 미지원·중복 쿼리 조건 |
| 404 | RECORD_NOT_FOUND / SCHEDULE_NOT_FOUND | 없는 기록/일정 |
| 503 | STORAGE_UNAVAILABLE | DB 연결/트랜잭션 시작 불가 |
| 500 | INTERNAL_ERROR | 예상하지 못한 서버 오류 |

미지원 JSON 필드는 거부한다. 날짜는 YYYY-MM-DD이며 시간대 변환 없이 처리한다. 일정 시간은 서울 현지 시각 HH:mm이고 생성·수정 시각은 UTC ISO 8601 Z다. 수정 충돌 제어는 없으며 여러 탭에서는 마지막 저장이 반영된다. 원문 저장/조회는 AI를 호출하지 않는다.

## 아직 미구현인 서비스 API

/api/ai/search와 /api/schedules/{id}/prepare는 후속 단계다. 기존 /api/ai/generate는 일반 생성 연결 테스트용이며 기록 기반 답변·출처를 제공하지 않는다. FastAPI /health 응답은 모델 준비나 AI 업무 기능 검증을 뜻하지 않는다.

테이블과 저장 규칙은 [ERD.md](ERD.md), 검증 결과는 [HANDOFF.md](HANDOFF.md)를 참고한다.

## t&tech 팀 API

| 경로 | 동작 |
|---|---|
| `GET /api/team/auth/session` | 현재 사용자(팀 ID·이름·유형, `isAdmin`, `title` 포함)와 처음 설치 여부(`setupRequired`: 사용자 0명). 처음 설치일 때는 고를 팀 목록(`teams`)도 준다. 사용 중인 대표·본부장 직급(`takenTitles`)도 준다 |
| `POST /api/team/auth/{setup,login,logout}` | 처음 설정, 로그인, 로그아웃. 처음 설정(사용자 0명일 때만)은 `teamId`·`title`을 받아 관리자 계정을 만든다(직급이 팀장이면 그 팀 팀장도 맡음) |
| `POST /api/team/auth/{invite,accept}` | 7일 유효 1회용 초대 링크 발급, 링크로 계정 생성. 관리자는 `teamId`(생략하면 자기 팀)·`role`(LEAD·MEMBER)을 지정하고, 팀장은 자기 팀 팀원만 초대한다. 수락할 때 `title`(대표·본부장·팀장·프로, 기본 프로)을 본인이 고른다. 대표·본부장은 회사 전체에 각각 1명이라 이미 있으면 409 `TITLE_TAKEN`(초대는 소모되지 않음). 팀장으로 초대받으면 직급은 팀장으로 정해지고, 팀원 초대에서 팀장을 고르면 400 `LEAD_TITLE`. `GET /api/team/auth/invite?token=`은 초대받은 이메일·팀 이름·역할을 보여준다 |
| `GET /api/team/auth/invites` | 수락 대기 중인 유효한 초대(이메일·팀·역할·만료). 관리자는 전체, 팀장은 자기 팀. 같은 이메일로 다시 초대하면 이전 링크는 무효가 되고 1건만 남는다 |
| `GET/POST /api/team/teams`, `PUT /api/team/teams/{id}` | 팀 목록(팀장 이름·인원 포함, 로그인 사용자 모두), 팀 추가·수정(관리자) |
| `GET /api/team/users`, `PUT /api/team/users/{id}` | 관리자 전용 사용자 목록과 변경(`teamId`, `role`, 선택 `title`·`isAdmin`). 팀장을 지정하면 기존 팀장은 팀원이 되고, 마지막 관리자의 권한은 회수할 수 없다(409 `LAST_ADMIN`). 팀장 권한을 주면 직급도 팀장이 되고 기존 팀장은 팀원 권한·프로가 된다. 팀원 권한에 팀장 직급을 주면 400 |
| `GET /api/team/members` | 같은 팀 사용자 ID·이름·이메일·역할·직급·관리자 여부 |
| `GET/POST /api/team/work` | 월·담당자·유형·상태·검색어로 업무 조회, 업무 등록 |
| `GET/PUT/DELETE /api/team/work/{id}` | 업무 조회와 담당자·팀장의 수정·삭제 |
| `POST /api/team/work/{id}/delivery` | 완료한 견적에서 연결된 납품 업무 등록 |
| `GET /api/team/dashboard` | 오늘·기한 초과·이번 주·이번 달 업무 목록 |
| `GET /api/team/reports/{월요일}` | 내 보고, 게시된 팀 보고, 팀장용 개인 제출 현황 |
| `PUT /api/team/reports/{월요일}/{personal,team}` | 초안 저장·제출. 팀 보고는 팀장만 작성 |

팀 업무·대시보드·회의·보고·구성원은 요청한 사용자의 팀으로 범위가 제한된다. 관리자와 팀장 이상(팀장·본부장·대표)은 `?team=ID`로 다른 팀을 조회만 할 수 있고(그 외 403, 다른 팀 변경 요청도 403), 다른 팀 업무 ID는 404다. 업무 배정과 담당자 변경은 팀장만, 같은 팀 사람에게만 가능하다. 팀 목록(`GET /api/team/teams`)은 팀별 오늘·기한 초과 업무 수(`todayCount`, `overdueCount`)를 함께 준다.

- `/api/team/personal/work`와 `/api/team/personal/dashboard`는 현재 사용자 개인 공간을 조회한다. 개인 업무의 상세 조회와 변경도 같은 `personal/work` 경로를 쓰며, 팀 업무와 다른 사용자의 개인 업무 ID는 404로 처리한다.
- `GET/PUT /api/team/meetings/{daily|weekly}/{날짜}`는 안건·결정·후속 업무를 조회하거나 저장한다. 주간회의는 월요일을 기준으로 한다. 기존 회의 보고는 작성자와 팀장이 수정할 수 있다.
- `GET /api/team/work?scope=all`은 팀 공유 업무를 반환한다. 업무 저장 시 `time`, `alerts`, `repeat`를 지정할 수 있으며, 기존 호출에서 생략하면 수정 시 기존 값을 유지한다. `alerts`는 `90일 전`, `30일 전`, `7일 전`, `3일 전`, `1일 전`, `당일` 중에서 고른다.
- 업무 `category`는 팀 유형을 따른다. 영업형 `QUOTE`·`DELIVERY`·`MEETING`·`OTHER`, 개발형·연구형(`TECH`, 기업부설연구소) `DEVELOP`·`TEST`·`FIELD`·`MEETING`·`OTHER`, 지원형 `PURCHASE`·`APPROVAL`·`HR`·`ACCOUNTING`·`OTHER`. 개인 공간은 본인 팀의 유형(관리자는 지원형)을 따른다. 유형에 맞지 않는 구분은 400이며, 이미 저장된 구분은 그대로 수정할 수 있다.
- `GET /api/team/meetings/{daily|weekly}/{날짜}/work`는 보고서에 연결할 팀 업무를 반환한다. 보고서에 `workIds`와 `action`을 보내 초안 저장·상신할 수 있다. 상신 이후 내용은 잠기고 팀장만 결재할 수 있다.
