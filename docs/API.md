# MEMORIA 현재 API

2026-11-17, 4단계까지 구현한 계약이다. 미구현 최종 목표와 구분한다. 브라우저는 /api 프록시를 사용하며 백엔드는 localhost:8080에서 실행한다. 인증은 없는 로컬 단일 사용자 MVP다.

## 기록

| Method | URL | 동작 |
|---|---|---|
| POST | /api/records | 메모·일기 등록, 201 + Location + 상세 |
| GET | /api/records | 전체/종류별 목록, 캘린더 기간 조회 |
| GET | /api/records/{id} | 상세, 200 |
| PUT | /api/records/{id} | 제목·본문·날짜 전체 수정, 종류 변경 불가 |
| DELETE | /api/records/{id} | 물리 삭제, 204 |

등록: recordType(MEMO/DIARY), content, recordDate 필수. title은 일기만 선택이다. 수정은 content, recordDate와 선택 title을 받는다. 제목 최대 100자, 본문 최대 10,000 UTF-16 코드 단위, 공백 본문 거부, 기록 날짜는 서울 오늘까지 허용한다.

목록 조건: type 생략은 전체, MEMO/DIARY 지정 가능. page 기본 0, size 기본 20(1~100). 캘린더 start/end는 둘 다 지정하며 양끝 포함, type과 동시 사용 불가다. keyword/from/to는 제거했으므로 빈 값도 포함해 400이다. 정렬은 recordDate·createdAt·id 내림차순이며 임의 sort는 받지 않는다.

상세: id(문자열), recordType, title, content, recordDate, contentVersion, embeddingStatus, indexedVersion, createdAt, updatedAt. 목록은 content 대신 preview를 제공한다. 본문/제목/날짜 변경 시 버전 증가·PENDING, 동일 값 저장은 버전 유지다. 목록 응답은 items/page/size/totalElements/totalPages다.

## 일정

| Method | URL | 동작 |
|---|---|---|
| POST | /api/schedules | 등록, PLANNED 고정, 201 + Location + 상세 |
| GET | /api/schedules | 기간/상태별 페이지 목록 |
| GET | /api/schedules/{id} | 상세 |
| PUT | /api/schedules/{id} | 입력 필드와 상태 전체 수정 |
| DELETE | /api/schedules/{id} | 물리 삭제, 204 |

등록 필수: title(최대 100자), scheduleDate(1000-01-01~9999-12-31, 과거/미래 허용). 선택: scheduleTime(HH:mm, 초 단위 거부), location(최대 200자), description(최대 2,000자). 시간 null/빈 문자열은 미정이며 선택 문자열 공백은 null로 정리한다. 수정 시 status(PLANNED/COMPLETED/CANCELLED)를 반드시 보낸다. 상태를 자동 변경하지 않는다.

목록 조건: start/end 양끝 포함, 둘 다 생략하면 서울 오늘~6일 후. 한쪽만 지정하거나 역전하면 400이다. status 생략은 전체, 홈은 PLANNED 지정. page 기본 0, size 기본 20(1~100). 정렬은 날짜 오름차순 → 시간 있는 일정 먼저/시간 오름차순 → ID 오름차순이다.

상세와 목록 항목은 id(문자열), title, scheduleDate, scheduleTime(HH:mm 또는 null), location, description, status, createdAt, updatedAt이다. 페이지 응답은 기록과 같다. 작성/수정 시각은 UTC이며 일정은 DB와 같은 마이크로초 정밀도다.

## 오류·제약

기록/일정은 code, message, fieldErrors 배열로 오류를 응답한다. 항목별 오류는 field/message를 포함한다.

| HTTP | code | 조건 |
|---|---|---|
| 400 | VALIDATION_ERROR | 필수값·길이·날짜 범위·상태·페이지 규칙 위반 |
| 400 | INVALID_REQUEST | JSON/날짜/ID 형식, 미지원·중복 쿼리 조건 |
| 404 | RECORD_NOT_FOUND / SCHEDULE_NOT_FOUND | 없는 기록/일정 |
| 503 | STORAGE_UNAVAILABLE | DB 연결/트랜잭션 시작 불가 |
| 500 | INTERNAL_ERROR | 예상하지 못한 서버 오류 |

미지원 JSON 필드는 거부한다. 날짜는 YYYY-MM-DD, 시각은 UTC ISO 8601 Z다. 수정 충돌 제어는 없으며 여러 탭에서는 마지막 저장이 반영된다. 원문 저장/조회는 AI를 호출하지 않는다.

## 아직 미구현인 서비스 API

/api/calendar, /api/ai/search, /api/schedules/{id}/prepare는 후속 단계다. 기존 /api/ai/generate는 일반 생성 연결 테스트용이며 기록 기반 답변·출처를 제공하지 않는다. FastAPI /health 응답은 모델 준비나 AI 업무 기능 검증을 뜻하지 않는다.

세부 데이터 정책은 [MINIMUM_DESIGN.md](MINIMUM_DESIGN.md), 검증 결과는 [STAGE4_CHECK.md](STAGE4_CHECK.md)를 참고한다.
