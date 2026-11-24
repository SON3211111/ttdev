# t&tech API

`GET /api/health`는 SQL Server 연결이 준비되면 `{"status":"ok"}`를 반환한다. 팀 API는 로그인·초대 등 인증 경로를 제외하고 팀 세션을 요구한다. 오류 응답에는 `code`, `message`, `fieldErrors`가 들어간다.

## 팀 API

| 경로 | 동작 |
|---|---|
| `GET /api/team/auth/session` | 현재 사용자와 처음 설치 여부. `membershipTeamId`는 소속 팀, `managedTeamId`는 맡은 팀, `teamId`는 기본 업무 팀이다. 회사 소속은 `membershipTeamId: null`이다 |
| `POST /api/team/auth/{setup,login,logout}` | 처음 설정은 빈 DB에서 회사 소속 대표 계정을 만든다. 로그인·로그아웃은 본인 세션을 관리한다 |
| `POST /api/team/auth/profile` | 현재 사용자의 이름만 수정한다 |
| `POST /api/team/auth/{invite,accept}` | 7일 유효 1회용 초대 링크 발급, 링크로 계정 생성. 관리자는 `teamId`·`role`(LEAD·MEMBER)을 지정하고, 팀장은 자기 팀 팀원만 초대한다. 초대 역할에 따라 팀장·프로 직급이 정해진다. 대표·본부장은 조직 관리에서 지정한다. `GET /api/team/auth/invite?token=`은 초대 이메일·팀 이름·역할을 보여준다 |
| `GET /api/team/auth/invites` | 수락 대기 중인 유효한 초대(이메일·팀·역할·만료). 관리자는 전체, 팀장은 자기 팀을 본다. 같은 팀에서 같은 이메일로 다시 초대하면 해당 팀의 이전 링크가 무효가 된다 |
| `POST /api/team/auth/invite-cancel` | 팀과 이메일로 대기 중인 초대를 취소한다. 팀장은 자기 팀 팀원 초대만 취소할 수 있다 |
| `POST /api/team/auth/password` | 현재 비밀번호 확인 후 새 비밀번호로 변경하고 계정의 모든 세션을 폐기한다 |
| `PUT /api/team/users/{id}/access` | 관리자가 `active`로 계정을 비활성화하거나 활성화한다. 비활성화할 때 전체 세션을 폐기한다. 마지막 활성 관리자는 비활성화할 수 없다 |
| `GET/POST /api/team/teams`, `PUT /api/team/teams/{id}` | 회사 관리자는 전사 목록과 팀 관리를, 일반 팀장·팀원은 자기 팀 목록을 조회한다 |
| `GET /api/team/users`, `PUT /api/team/users/{id}` | 회사 관리자가 다른 사용자의 `title`·`teamId`·`managedTeamId`를 변경한다. 본인 변경은 403, 기존 팀장 교체에는 `replaceLead: true`가 필요하다 |
| `GET /api/team/users/history` | 회사 관리자가 소속·직급·담당 팀·계정 상태의 변경 이력을 확인한다 |
| `GET /api/team/members` | 같은 팀 사용자 ID·이름·이메일·역할·직급·관리자 여부 |
| `GET/POST /api/team/work` | 월·담당자·유형·상태·검색어로 업무 조회, 업무 등록 |
| `GET/PUT/DELETE /api/team/work/{id}` | 업무 조회와 담당자·팀장의 수정·삭제 |
| `GET /api/team/work/{id}/history` | 해당 업무를 볼 수 있는 사용자가 최근 100개 일정·시각·담당자·상태 변경을 조회한다. 개인 업무는 `/api/team/personal/work/{id}/history`를 사용한다 |
| `GET /api/team/work/{id}/meetings` | 업무가 연결된 같은 팀 일일·주간회의의 종류와 날짜를 반환한다 |
| `GET/POST /api/team/work/{id}/attachments`, `GET/DELETE /api/team/work/{id}/attachments/{fileId}` | 첨부 조회·등록·다운로드·삭제. 등록은 `name` 쿼리와 파일 본문을 보낸다. PDF·PNG·JPEG만 파일당 5MB, 업무당 10개까지 허용한다. 읽기·변경은 각각 업무 접근 권한을 적용한다. 개인 업무는 `personal/work` 경로를 사용한다 |
| `POST /api/team/work/{id}/delivery` | 완료한 견적에서 연결된 납품 업무 등록 |
| `GET /api/team/dashboard` | 오늘·기한 초과·이번 주·이번 달 업무 목록 |
| `GET /api/team/reports/{월요일}` | 내 보고와 게시된 팀 보고를 읽는다. 회사 관리자와 해당 팀 팀장은 개인 보고 제출분을 조회한다 |
| `PUT /api/team/meetings/{daily/weekly}/{날짜}/approval` | 회사 관리자 또는 담당 팀장이 상신된 보고를 결재한다. 응답에 결재자와 결재 시각을 포함한다 |
| `PUT /api/team/reports/{월요일}/{personal,team}` | 초안 저장·제출. 팀 보고는 팀장만 작성 |

팀 업무·대시보드·회의·보고·구성원은 팀 기준으로 범위를 제한한다. 회사 관리자는 `?team=ID`로 다른 팀을 조회하고 결재 전용 경로로 회의를 결재한다. 회사 관리자가 팀장을 맡은 팀에는 팀장 업무 수정 권한을 쓴다. 팀 목록은 팀별 오늘·기한 초과 업무 수도 함께 준다.

- `/api/team/personal/work`와 `/api/team/personal/dashboard`는 현재 사용자 개인 공간을 조회한다. 개인 업무의 상세 조회와 변경도 같은 `personal/work` 경로를 쓰며, 팀 업무와 다른 사용자의 개인 업무 ID는 404로 처리한다.
- `GET/PUT /api/team/meetings/{daily|weekly}/{날짜}`는 안건·결정·후속 업무를 조회하거나 저장한다. 주간회의는 월요일을 기준으로 한다. 기존 회의 보고는 작성자와 팀장이 수정할 수 있다.
- `GET /api/team/work?scope=all`은 팀 공유 업무를 반환한다. 업무 저장 시 `time`, `alerts`, `repeat`를 지정할 수 있으며, 기존 호출에서 생략하면 수정 시 기존 값을 유지한다. `alerts`는 `90일 전`, `30일 전`, `7일 전`, `3일 전`, `1일 전`, `당일` 중에서 고른다.
- 업무 `category`는 팀 유형을 따른다. 영업형 `QUOTE`·`DELIVERY`·`MEETING`·`OTHER`, 개발형·연구형(`TECH`, 기업부설연구소) `DEVELOP`·`TEST`·`FIELD`·`MEETING`·`OTHER`, 지원형 `PURCHASE`·`APPROVAL`·`HR`·`ACCOUNTING`·`OTHER`. 개인 공간은 본인 팀의 유형(관리자는 지원형)을 따른다. 유형에 맞지 않는 구분은 400이며, 이미 저장된 구분은 그대로 수정할 수 있다.
- `GET /api/team/meetings/{daily|weekly}/{날짜}/work`는 보고서에 연결할 팀 업무를 반환한다. 보고서에 `workIds`와 `action`을 보내 초안 저장·상신할 수 있다. 상신 이후에는 결재만 할 수 있다.
