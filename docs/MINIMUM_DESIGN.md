# MEMORIA 최소 설계 — 1단계

작성: 2026-11-17. 2026-11-18에 캘린더와 할 일 관리의 현재 설계를 반영했다.
기준: PROJECT_PLAN.md의 로컬 단일 사용자 MVP. 이 문서는 구현 완료를 의미하지 않는다.

Flyway V1(records), V2(schedules), V3(tasks, task_transitions)를 사용한다. 메모·일기·약속·할 일 관리와 현재 검증 결과는 [HANDOFF.md](HANDOFF.md)를 따른다.

초기 구현 이력: records의 Flyway V1과 JPA validate, 서울 날짜/UTC 시각, 메모 CRUD 연결은 적용·검증됐다. 아래의 '아직 설정을 변경하지 않았다', 'API 연결 때 수정' 등은 최초 설계 당시 설명이다. 최신 구현/검증 상태는 HANDOFF.md의 최신 절을 따른다.

## 1. 화면과 첫 기능

현재 홈의 QuickMemo → HomePage → RecentRecords 흐름을 유지한다.

```text
홈: [빠른 메모 본문 + 기록 날짜 + 저장] [일기 쓰기]
    [앞으로 7일: 예정 약속 + 마감하는 미완료 할 일] [물어보기 미리보기]
기록 메뉴: [전체/메모/일기]
       ↓ 기록 선택
기록 상세: 날짜 · 종류 · 선택 제목 · 원문 · 수정 · 삭제
       ↓ 수정                    ↓ 삭제 확인
수정 화면: 날짜 · 본문       확인 시 삭제 → 목록
       ↓ 저장 / 취소
상세와 목록 갱신 / 기존 상세로 복귀
```

- 메모 필수값은 본문·기록 날짜. 날짜는 오늘 기본값, 오늘 이전 선택 가능. 제목 입력 없음.
- 일기는 별도 작성 화면에서 날짜·본문·선택 제목. 하루 여러 기록 허용.
- 저장 중 중복 클릭을 막고 입력을 잠근다. 실패 시 본문·날짜를 보존하고 재시도 가능하게 한다.
- 성공 시 본문 초기화, 선택한 기록 날짜 유지, 전체 필터로 전환, 목록 첫 페이지 재조회.
- 삭제 전 “이 기록을 영구 삭제할까요? 삭제한 기록은 복구할 수 없습니다.” 확인을 표시한다. 취소 시 원문을 유지하고, 확인한 경우에만 DELETE를 요청한다. 요청 중 중복 삭제를 막고 실패 시 화면에서 기록을 제거하지 않는다.
- 과거 날짜 메모는 실제 기록 날짜 위치에 표시한다. 저장 성공과 목록 갱신 실패를 구분한다. 후자의 경우 저장을 다시 요청하지 않고 목록 재조회 버튼을 제공한다.
- 요청 타임아웃은 저장 여부가 불확실할 수 있으므로 목록 확인 후 재시도하도록 안내한다. MVP에 자동 POST 재시도는 넣지 않는다.
- API 연결 시 예시 기록을 실제 데이터와 섞지 않는다. 조회 실패와 빈 목록을 구분한다.
- 홈의 **앞으로 7일**은 서울 기준 오늘~6일 후 두 종류를 함께 보여준다. 약속은 PLANNED만 포함하고, 같은 날 시간 있는 약속은 시간순으로 표시한다. 할 일은 해당 기간에 마감하는 미완료 상태로 제한한다.

## 2. 데이터 구조

Record와 Schedule은 독립 테이블이며 MVP에서 서로 FK로 연결하지 않는다.
Record 1건은 향후 Qdrant 청크 여러 개와 record_id/content_version으로 논리 연결한다.
MySQL이 원본이며 벡터는 재생성 가능한 인덱스다.

| records 컬럼 | DB 타입 | 규칙 |
|---|---|---|
| record_id | BIGINT PK, 자동 증가 | API에서는 문자열 ID로 전달 |
| record_type | VARCHAR(10) | MEMO / DIARY, 필수, 수정 시 종류 변경 불가 |
| title | VARCHAR(100), NULL 허용 | 일기만 선택 입력, 메모는 NULL |
| content | TEXT | 필수, 최대 10,000 UTF-16 코드 단위 |
| record_date | DATE | 실제 경험 날짜, 서울 기준 미래 거부 |
| content_version | BIGINT | 최초 1, 원문 관련 변경 시 +1 |
| embedding_status | VARCHAR(10) | PENDING / COMPLETED / FAILED, 최초 PENDING |
| indexed_version | BIGINT, NULL 허용 | 마지막 성공 버전, 최초 NULL |
| created_at / updated_at | DATETIME(6) | UTC 저장, 서버가 설정 |

본문 최대 길이는 메모·일기에 동일하게 적용한다. 글 길이로 종류를 자동 변경하지 않는다.
문자열은 앞뒤 공백을 제거하되 본문 내부 공백·줄바꿈은 보존한다. 줄바꿈은 LF로 통일한다.
공백만 있는 본문 거부. 선택 제목이 비어 있으면 NULL. MEMO에 비어 있지 않은 제목은 400.
이모지 등 보충 문자는 길이 계산에서 2로 센다. 프론트·백엔드 검증을 동일하게 맞춘다.
DB 문자셋은 utf8mb4. 목록 인덱스는 (record_date, created_at, record_id), 종류별 인덱스는 (record_type, record_date, created_at, record_id).

| schedules 컬럼 | DB 타입 | 규칙 |
|---|---|---|
| schedule_id | BIGINT PK, 자동 증가 | API에서는 문자열 ID |
| title | VARCHAR(100) | 공백 제거 후 필수 |
| schedule_date | DATE | 필수, 과거 날짜도 허용 |
| schedule_time | TIME, NULL 허용 | 서울 현지 시각, 분 단위, 시간 미정 허용 |
| location | VARCHAR(200), NULL 허용 | 선택 |
| description | TEXT, NULL 허용 | 선택, 최대 2,000 UTF-16 코드 단위 |
| status | VARCHAR(10) | PLANNED / COMPLETED / CANCELLED, 최초 PLANNED |
| created_at / updated_at | DATETIME(6) | UTC, 서버 설정 |

일정의 선택 문자열은 공백 제거 후 빈 값이면 NULL. 상태는 사용자가 변경하며 자동 완료하지 않는다.
조회 인덱스는 (status, schedule_date, schedule_time, schedule_id).
로그인용 사용자 테이블·사진·기록 연결 테이블은 추가하지 않는다.

## 3. 날짜·시간·버전

- 날짜는 `YYYY-MM-DD`, 일정 시각은 `HH:mm`, 작성/수정 시각은 UTC ISO 8601(`Z`)로 응답한다.
- 프론트의 날짜 기본값과 서버의 미래 날짜 검증은 모두 Asia/Seoul 기준이다. 프론트 날짜 유틸리티도 서울 기준으로 적용했다.
- DATE는 UTC 변환하지 않는다. 캘린더는 record_date/schedule_date 기준, 작성 시각 기준이 아니다.
- Record의 종류·제목·본문·날짜가 검색 근거다. 제목/본문/날짜가 변경되면 버전 증가 및 PENDING 처리. 같은 내용 재저장은 버전을 올리지 않는다.
- 목록 정렬은 record_date DESC, created_at DESC, record_id DESC. 현재 예시의 ID 정렬은 실제 API 연결 시 이 기준으로 교체한다.

## 4. 스키마 관리와 AI 분리

- 스키마 변경은 버전 SQL 마이그레이션(Flyway)으로 관리하고 JPA는 validate로 검증하는 방향으로 설계한다. 현재는 Flyway V1/V2와 ddl-auto=validate로 적용했다.
- 2단계에서 DB 테이블 현황부터 확인하고 records 초기 마이그레이션을 추가한다. schedules는 4단계 V2로 추가·적용했다. 기존 테이블/데이터를 임의 삭제하거나 무조건 baseline하지 않는다.
- 적용한 SQL은 수정하지 않고 후속 버전으로 변경한다. 실제 의존성·설정·빈 DB/기존 DB 적용 검증은 2단계 작업이다.
- 원문 저장 트랜잭션에서는 MySQL만 사용한다. FastAPI/Ollama/Qdrant 호출을 기다리지 않는다.
- 6단계에서 PENDING/FAILED 기록을 처리하는 재시도 가능한 워커를 붙인다. 현재 단계에서 큐·워커 구현은 하지 않는다.
- 워커 완료 갱신은 처리한 버전이 현재 버전과 일치할 때만 허용한다. 오래된 작업이 새 버전 상태를 덮어쓰면 안 된다.
- 검색 후보는 MySQL 존재 여부·현재 content_version·청크 버전을 검증한다. 답변 생성 후 반환 전에도 검증하며 변경된 근거가 있으면 재조회 안내로 처리한다.
- 기록·일정은 삭제 확인 후 MySQL에서 물리 삭제한다. 휴지통·복구 기능·deleted_at 컬럼은 두지 않는다. 기록 원문이 없어진 즉시 검색 근거에서 제외한다. 벡터 정리 실패는 원문 삭제를 막지 않으며, 6단계에서 원문 없는 벡터의 주기적 정리·재시도 경로를 구현한다.

## 5. 첫 기능 API 계약

JSON 키는 camelCase, enum은 영문 대문자. DB Entity를 직접 응답하지 않고 DTO를 사용한다.
MEMO와 DIARY 저장/조회/수정/삭제는 2~3단계에서 연결·검증했다.

### 등록

`POST /api/records` → 201 + `Location: /api/records/{id}`

```json
{
  "recordType": "MEMO",
  "content": "민수에게 빌린 책 다음에 돌려주기",
  "recordDate": "2026-11-17"
}
```

성공 응답과 상세 응답은 동일한 구조다.

```json
{
  "id": "1",
  "recordType": "MEMO",
  "title": null,
  "content": "민수에게 빌린 책 다음에 돌려주기",
  "recordDate": "2026-11-17",
  "contentVersion": 1,
  "embeddingStatus": "PENDING",
  "indexedVersion": null,
  "createdAt": "2026-11-17T01:00:00Z",
  "updatedAt": "2026-11-17T01:00:00Z"
}
```

PENDING은 원문 저장 성공·검색 인덱스 준비 전을 뜻한다. AI 미연결을 저장 실패로 표시하지 않는다.

### 조회

- `GET /api/records/{id}` → 200 상세, 없으면 404.
- `GET /api/records?type=MEMO&page=0&size=20` → 200 목록.
- type 생략 시 전체, page 기본 0·0 이상, size 기본 20·1~100. 홈은 size=5.
- 현재 캘린더 조회: `start`와 `end`는 모두 지정해야 하며 기록 날짜 양끝을 포함한다. start > end, 한쪽만 지정, type과 동시 지정은 400이다. 기존 월 조회 호출은 이 계약을 유지한다.
- 2026-11-17 사용자 요청으로 제목·본문 검색과 from/to 날짜 검색을 제거했다. keyword/from/to는 빈 값도 포함해 미지원 조건으로 400 응답한다. 캘린더용 start/end 조회는 유지한다.
- 미지원 검색 조건은 무시하지 않고 400으로 응답한다. 고정 정렬이며 임의 sort 파라미터는 받지 않는다.
- 목록 item은 상세와 같은 필드에서 content를 제외하고 preview(앞 120 Unicode 코드 포인트, 줄바꿈은 공백)를 제공한다. 원문은 상세에서 조회한다.

```json
{
  "items": [],
  "page": 0,
  "size": 20,
  "totalElements": 0,
  "totalPages": 0
}
```

### 수정·삭제

- `PUT /api/records/{id}`: content·recordDate·선택 title 전체 교체. recordType은 요청에 넣지 않는다. 성공 200 상세. 날짜 변경도 미래 검증을 적용한다.
- `DELETE /api/records/{id}`: 물리 삭제. 성공 204(본문 없음), 없는 ID는 404. 확인 UI는 프론트에서 제공하며 API는 요청받은 삭제를 수행한다.
- 수정·삭제 후 상세/목록을 서버에서 재조회한다. 수정 취소 시 기존 원문을 유지한다.
- 낙관적 동시 수정 충돌 처리는 후속 검토다. MVP에서 여러 탭 동시 수정은 마지막 저장이 반영되며 이 한계를 명시한다.

### 공통 오류

업무 API에 적용한다. 기존 `/api/ai/generate` 오류 계약을 이번 단계에서 바꾸지 않는다.

```json
{
  "code": "VALIDATION_ERROR",
  "message": "입력 내용을 확인해주세요.",
  "fieldErrors": [
    { "field": "content", "message": "본문을 입력해주세요." }
  ]
}
```

| HTTP | code | 적용 |
|---|---|---|
| 400 | VALIDATION_ERROR | 필수값·길이·미래 기록 날짜·enum·페이지 조건 |
| 400 | INVALID_REQUEST | 잘못된 JSON·날짜 형식·ID 형식·미지원 조건 |
| 404 | RECORD_NOT_FOUND | 존재하지 않는 기록 |
| 500 | INTERNAL_ERROR | 예상하지 못한 오류, 내부 상세 비공개 |
| 503 | STORAGE_UNAVAILABLE | DB 연결 장애 등 저장소 사용 불가 |

fieldErrors는 필드별 오류가 없으면 빈 배열. 응답/로그에 입력 본문·DB 비밀번호·스택을 그대로 노출하지 않는다.

## 6. 다음 구현과 완료 체크

1. 저장 후 선택 날짜 유지·확인 후 영구 삭제 정책 확정 완료. 아래 구현은 2단계 작업이다.
2. DB 현황 확인 → records 마이그레이션 → Entity/Repository/Service/DTO/Controller/공통 오류.
3. 등록·조회 API → 프론트 API 모듈 → 홈 예시 제거·실제 저장·조회.
4. 상세·수정·삭제와 화면 상태 연결. 컴포넌트별 TSX/CSS 구조 유지.

2단계 검증 기준:

- [x] 화면 저장 후 새로고침해도 원문 유지.
- [x] 과거 날짜 정렬·한 날짜 여러 메모·상세 원문 확인.
- [x] 공백 본문·길이 초과·잘못된/미래 날짜·없는 ID 처리.
- [x] 저장 중 중복 클릭 차단, 실패 시 입력 보존, 조회 실패 재시도.
- [x] 수정·날짜 변경 반영, 삭제 확인·삭제 후 제외.
- [x] AI 서비스를 사용할 수 없어도 저장·조회 가능.
- [x] DB 마이그레이션 적용과 재시작 후 기록 유지 확인.

설계 검토와 실제 실행 검증을 구분한다. 2026-11-17에 위 항목 검증 완료. 상세 결과는 `STAGE2_CHECK.md` 참고.

1단계 완료 근거: Record/Schedule 구조·필수값·길이·삭제, 날짜·시간, 스키마 관리 방향, 첫 기능 API/오류 계약, 화면 흐름과 구현 검증 기준을 문서화했다. DB 마이그레이션·API·원문 저장 기능의 구현 완료를 의미하지 않는다.

## 7. 4단계 일정 API 계약 (2026-11-17)

- POST /api/schedules: title·scheduleDate 필수, scheduleTime(HH:mm)·location·description 선택. 최초 PLANNED 고정, 201 + Location + 상세 응답. 날짜는 1000-01-01~9999-12-31, 과거/미래 모두 허용한다.
- GET /api/schedules/{id}: 상세, PUT: 모든 입력 필드와 status 전체 교체, DELETE: 확인 후 물리 삭제(204). 없는 ID는 404 SCHEDULE_NOT_FOUND. JSON 미지원 필드는 400이다.
- PUT status는 PLANNED/COMPLETED/CANCELLED 중 필수. 자동 완료는 없다. 시간 null 또는 빈 문자열은 시간 미정, 초 단위와 잘못된 HH:mm은 400이다.
- GET /api/schedules: 사용자 요청으로 기간/상태별 관리 조회를 제거했다. 서울 오늘~6일 후 PLANNED만 반환하며 start/end/status 파라미터는 400이다.
- page 기본 0, size 기본 20(1~100), 고정 정렬은 날짜 오름차순 → 시간 있는 일정 먼저/시간 오름차순 → ID 오름차순. 목록 응답은 items/page/size/totalElements/totalPages다.
- 상세 필드: id(문자열), title, scheduleDate, scheduleTime(HH:mm 또는 null), location, description, status, createdAt/updatedAt(UTC). 길이와 빈 문자열 정리는 앞의 일정 데이터 설계를 따른다. 오류는 기록 API와 동일한 code/message/fieldErrors 계약이다.
- 홈의 다가오는 예정 목록만 제공한다. 기간별 관리 UI/API는 사용자 요청으로 제거했다. 저장 성공과 목록 실패는 분리하며 POST를 자동 재시도하지 않는다.
- 통합 캘린더에서 날짜를 선택해 작성할 수 있다. 여러 탭 동시 수정은 마지막 저장이 반영된다. AI 약속 준비는 8단계 범위다.

## 8. 캘린더 일정 관리 방향 — 2026-11-17 합의

캘린더에서 미래 날짜를 선택해 약속을 등록하고 날짜별 팝업에서 상세·수정·삭제·상태 변경을 한다. 먼 미래·과거 날짜와 완료·취소 약속도 날짜 팝업에서 접근할 수 있다.

캘린더는 월별 기록 조회와 `GET /api/calendar/schedules`, `GET /api/calendar/tasks`를 날짜별로 합쳐 표시한다. 홈은 `GET /api/schedules`의 7일 예정 약속과 같은 기간의 미완료 할 일을 날짜순으로 보여준다. 할 일의 상태·변경 이력·대시보드 계약은 [API.md](API.md)에 있다.

캘린더 날짜 칸에서 `dueDate`가 같은 할 일을 `TODO`·`DOING`은 **할 일**, `DONE`은 **완료한 일**로 집계한다. 날짜 팝업에는 항목별 상태를 표시한다.
