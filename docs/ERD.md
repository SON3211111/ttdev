# t&tech 데이터베이스

- [팀 접근](../backend-next/team-schema.sql)은 팀원, 세션과 일회용 초대를 저장한다. 세션과 초대 링크의 토큰은 해시로 저장한다.
- [팀 업무](../backend-next/team-work.sql)는 시작일·마감일, 등록자·현재 담당자, 상태와 원본 견적을 연결한다.
- [주간보고](../backend-next/team-reports.sql)는 팀·월요일·작성자·보고 종류를 키로 사용한다. 개인 보고를 제출하면 당시 완료·예정 업무를 함께 저장한다.
- [조직](../backend-next/db.mjs)의 `teams`는 이름·유형·근무지·정렬 순서를 저장한다. `team_users.team_id`는 소속 팀으로, 대표·본부장은 NULL이다. `managed_team_id`는 맡은 팀으로 일반 팀장과 겸임 본부장에게 적용한다. 팀당 한 명은 필터 고유 인덱스 `team_managed_once`, 대표·본부장 각 한 명은 `team_users_unique_title`로 보장한다. `is_admin`은 승인된 회사 관리 권한과 기존 관리자의 이전 상태를 표현한다.
- `team_org_history`는 변경 처리자·대상·시각·이전 값·새 값을 저장한다. 회의 결재는 `approved_by`와 `approved_at`에 기록한다.
- 팀 업무는 `team_id`(팀 업무) 또는 `personal_owner_id`(개인 업무) 중 하나만 가진다. 회의 보고서 키는 (`team_id`, 날짜, 종류)이고, 주간보고·초대도 `team_id`를 저장한다. 초대는 역할(LEAD·MEMBER)을 함께 저장한다.
- 조직 구조 이전의 단일 팀 데이터(사용자·팀 업무·회의·보고서·초대)는 마이그레이션에서 기술영업 1팀으로 옮긴다.

기존 설치에 남아 있는 개인 기록용 테이블은 그대로 보관된다. 새 데이터베이스에는 t&tech 테이블을 생성한다.
