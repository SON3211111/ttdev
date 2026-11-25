import { query } from '../db/db.mjs'
import { canViewAll } from './team-auth.mjs'
import { extractConditions, periodLabel, workPeriod } from './assistant-work-query.mjs'
import { seoulToday } from '../lib/validation.mjs'

// AI 생성 없이 DB에서 바로 답하는 질문들: 안내, 조직(팀장·구성원), 결재 대기 회의록, 회의 목록·내용.

const examples = ['이번 주 내 업무', '우리 팀 오늘 마감인 업무', '솔루션개발 2팀 인원 몇 명이야?', '우리 팀장 누구야?',
  '어제 일일회의 내용', '결재 대기 중인 회의록', '팀별 지연 업무 건수', '이번 주 완료율', 'TSK-0001 변경 경위']
export const helpText = `업무·회의 기록에서 바로 찾아 드릴 수 있는 질문 예시입니다.\n${examples.map(item => '· ' + item).join('\n')}`

export function helpQuestion(question) {
  const value = question.replace(/[\s?!.~ㅋㅎ^]+$/u, '').trim()
  return value.length <= 1 || /^(?:안녕(?:하세요)?|ㅎㅇ|하이|hi|hello|헬로|도움말|help|사용법|뭐\s*할\s*수\s*있어|뭘\s*물어|무엇을\s*물어|어떻게\s*써|업무|일정|회의|팀|ㅇㅇ|ㅎ+|ㅋ+)$/iu.test(value)
}

const scope = user => ({ team: user.teamId, allTeams: canViewAll(user) ? 1 : 0 })
// 팀 이름은 공백을 무시하고 비교한다. '우리팀'은 질문자 팀, 정확한 팀이 없는 'OO팀'은 앞부분이 같은 팀 묶음이다.
export const teamFilter = (nameColumn, idColumn) => `(@teamKey IS NULL
  OR REPLACE(${nameColumn},N' ',N'')=@teamKey
  OR (@teamKey=N'우리팀' AND ${idColumn}=@team)
  OR (RIGHT(@teamKey,1)=N'팀' AND LEN(@teamKey)>2 AND NOT EXISTS (SELECT 1 FROM teams x WHERE REPLACE(x.name,N' ',N'')=@teamKey)
    AND LEFT(REPLACE(${nameColumn},N' ',N''),LEN(@teamKey)-1)=LEFT(@teamKey,LEN(@teamKey)-1)))`
const teamKey = team => team?.replace(/\s/gu, '') ?? null

// ── 조직: 팀장·구성원·대표/본부장 ──
const leadAsk = /팀\s*장\s*(?:님)?\s*(?:은|이|는)?\s*(?:누구|누가|이름|뭐)|누가\s*팀\s*장/u
const membersAsk = /(?:구성원|팀원|멤버|명단|사람들?)\s*(?:은|이|들|는)?\s*(?:누구|누가|명단|알려|목록|보여|뭐)|누구\s*누구|누가\s*있|누구\s*있|명단/u
const executiveAsk = /(?<title>대표|본부장)\s*(?:님)?\s*(?:은|이|는)?\s*(?:누구|누가)/u

export function orgQuestion(question) {
  const executive = question.match(executiveAsk)
  if (executive && !/팀/u.test(question)) return { type: 'executive', title: executive.groups.title }
  const type = leadAsk.test(question) ? 'lead' : membersAsk.test(question) ? 'members' : null
  if (!type || /업무|일정|회의|마감/u.test(question)) return null
  const own = /(?:우리|내|저희)\s*팀/u.test(question)
  return { type, team: own ? '우리팀' : extractConditions(question.replace(/팀\s*장/gu, ' ')).team }
}

export async function readOrg(db, user, target) {
  if (target.type === 'executive') {
    const people = await query(db, 'SELECT name FROM team_users WHERE is_active=1 AND title=@title ORDER BY id', { title: target.title })
    const topic = target.title === '대표' ? '는' : '은'
    return { kind: 'org', sources: [], unavailable: false, criteria: ['조직관리 기준'],
      answer: people.length ? `${target.title}${topic} ${people.map(person => person.name).join(', ')}입니다.` : `등록된 ${target.title}${target.title === '대표' ? '가' : '이'} 없습니다.` }
  }
  const team = target.team ?? (user.teamId && !canViewAll(user) ? '우리팀' : null)
  if (target.type === 'members' && !team) {
    return { kind: 'org', sources: [], unavailable: false, answer: '어느 팀의 구성원을 볼까요? 예: 솔루션개발 2팀 구성원 누구야?' }
  }
  const params = { ...scope(user), teamKey: teamKey(team) }
  if (target.type === 'lead') {
    const rows = await query(db, `SELECT t.name AS team,u.name FROM teams t
      LEFT JOIN team_users u ON u.managed_team_id=t.id AND u.is_active=1
      WHERE (@allTeams=1 OR t.id=@team) AND ${teamFilter('t.name', 't.id')} ORDER BY t.sort_order,t.id`, params)
    if (!rows.length) return { sources: [], unavailable: false, answer: '열람할 수 있는 팀 범위에서 해당 팀을 찾지 못했습니다.' }
    const answer = rows.length === 1 ? `${rows[0].team} 팀장은 ${rows[0].name ?? '아직 지정되지 않았습니다'}${rows[0].name ? '입니다.' : ''}`
      : ['팀별 팀장입니다.', ...rows.map(row => `· ${row.team}: ${row.name ?? '미지정'}`)].join('\n')
    return { kind: 'org', sources: [], unavailable: false, answer, criteria: ['조직관리 기준'] }
  }
  const rows = await query(db, `SELECT t.name AS team,u.name,u.title,CASE WHEN u.managed_team_id=t.id THEN 0 ELSE 1 END AS lead
    FROM team_users u JOIN teams t ON t.id=u.team_id
    WHERE u.is_active=1 AND (@allTeams=1 OR t.id=@team) AND ${teamFilter('t.name', 't.id')}
    ORDER BY t.sort_order,t.id,lead,u.name`, params)
  if (!rows.length) return { sources: [], unavailable: false, answer: '열람할 수 있는 팀 범위에서 해당 팀을 찾지 못했습니다.' }
  const teams = [...new Set(rows.map(row => row.team))]
  const answer = [`${teams.join(', ')} 구성원 ${rows.length}명입니다.`,
    ...rows.map(row => `· ${row.name}${row.title ? ` (${row.title})` : ''}${teams.length > 1 ? ` · ${row.team}` : ''}`)].join('\n')
  return { kind: 'org', sources: [], unavailable: false, answer, criteria: ['활성 소속 구성원 기준'] }
}

// ── 회의록 공통 ──
const meetingColumns = `CONCAT('team-reports?kind=',m.kind,'&date=',CONVERT(char(10),m.meeting_date,23),'&team=',m.team_id) AS route,
  CONCAT(CONVERT(char(10),m.meeting_date,23),CASE m.kind WHEN 'daily' THEN N' 일일회의' ELSE N' 주간회의' END) AS title,
  t.name AS context, CONVERT(char(10),m.meeting_date,23) AS [date], m.approval_status AS approvalStatus,
  CONCAT_WS(NCHAR(10), CASE WHEN m.agenda<>N'' THEN CONCAT(N'안건: ',CONVERT(nvarchar(max),m.agenda)) END,
    CASE WHEN m.decisions<>N'' THEN CONCAT(N'결정: ',m.decisions) END,
    CASE WHEN m.followups<>N'' THEN CONCAT(N'후속 조치: ',m.followups) END) AS excerpt,
  m.decisions, m.followups`
const approvalLabels = { APPROVED: '승인 완료', PENDING: '결재 대기', DRAFT: '초안' }
const toSource = ({ route, title, context, date, excerpt, approvalStatus }) => ({ route, title, context, date, excerpt, approvalStatus })
const clip = (value, size = 160) => (value ?? '').replace(/\s+/gu, ' ').trim().slice(0, size)

// ── 결재 대기 회의록 ──
export const approvalQuestion = question => /결재|승인\s*(?:대기|요청|안\s*된|전|필요)|미승인|승인\s*안/u.test(question)

export async function readApprovals(db, user, question, today = seoulToday()) {
  const { team, period } = extractConditions(question, { today })
  const status = /초안|작성\s*중|임시/u.test(question) ? 'DRAFT' : 'PENDING'
  const range = workPeriod(period, today)
  const rows = await query(db, `SELECT ${meetingColumns} FROM team_meetings m JOIN teams t ON t.id=m.team_id
    WHERE (@allTeams=1 OR m.team_id=@team) AND ${teamFilter('t.name', 't.id')} AND m.approval_status=@status
      ${range ? 'AND m.meeting_date BETWEEN @from AND @to' : ''}
    ORDER BY m.meeting_date DESC,t.sort_order`, { ...scope(user), teamKey: teamKey(team), status, ...(range ? { from: range[0], to: range[1] } : {}) })
  const label = approvalLabels[status]
  const criteria = [team, range && `${periodLabel(period)} (${range[0]}${range[0] === range[1] ? '' : ' ~ ' + range[1]})`, `${label} 회의록`].filter(Boolean)
  return { kind: 'approval', sources: rows.map(toSource), unavailable: false, criteria,
    answer: rows.length ? `${label} 상태인 회의록이 ${rows.length}건 있습니다.` : `${label} 상태인 회의록이 없습니다.` }
}

// ── 회의 목록·내용 ──
const meetingWord = /회의|미팅|회의록/u
const meetingFiller = /회의록?\S*|미팅\S*|일일\S*|주간\S*|데일리|위클리|요약\S*|내용\S*|결정\S*|논의\S*|안건\S*|후속\S*|조치\S*|뭐라고\S*|했어\S*|했나\S*|했는지|열렸\S*|있었\S*|열리\S*|진행된|어떤|어떻게|관련해서|관련/gu
export const meetingQuestion = question => meetingWord.test(question) && !/왜|이유|경위|변경|바뀌|몇\s*명|참석/u.test(question)

export async function readMeetings(db, user, question, today = seoulToday()) {
  const { team, period, words } = extractConditions(question, { today, extraFiller: meetingFiller })
  if (words.length > 2) return null
  const kind = /일일|데일리/u.test(question) ? 'daily' : /주간|위클리/u.test(question) ? 'weekly' : null
  const range = workPeriod(period, today)
  const recent = !range && !words.length
  const params = { ...scope(user), teamKey: teamKey(team), kind, today, ...(range ? { from: range[0], to: range[1] } : {}),
    ...Object.fromEntries(words.map((word, i) => ['kw' + i, word])) }
  const rows = await query(db, `SELECT TOP (${recent ? 5 : 30}) ${meetingColumns} FROM team_meetings m JOIN teams t ON t.id=m.team_id
    WHERE (@allTeams=1 OR m.team_id=@team) AND ${teamFilter('t.name', 't.id')} AND (@kind IS NULL OR m.kind=@kind)
      ${range ? 'AND m.meeting_date BETWEEN @from AND @to' : recent ? 'AND m.meeting_date<=@today' : ''}
      ${words.map((_, i) => `AND (CHARINDEX(@kw${i},m.agenda)>0 OR CHARINDEX(@kw${i},m.decisions)>0 OR CHARINDEX(@kw${i},m.followups)>0)`).join(' ')}
    ORDER BY m.meeting_date DESC,t.sort_order`, params)
  // 키워드가 언급된 회의록이 없으면 호출한 쪽이 관련 업무를 대신 찾도록 알린다.
  if (!rows.length && words.length) return { missingKeyword: words.join(' ') }
  const kindLabel = { daily: '일일회의', weekly: '주간회의' }[kind] ?? '회의'
  const criteria = [team, words.length && `‘${words.join(' ')}’ 포함`, range ? `${periodLabel(period)} (${range[0]}${range[0] === range[1] ? '' : ' ~ ' + range[1]})` : recent && '최근 회의', kindLabel].filter(Boolean)
  if (!rows.length) return { kind: 'meeting', sources: [], unavailable: false, criteria, answer: `조건에 맞는 ${kindLabel} 기록이 없습니다.` }
  const shown = rows.slice(0, 3)
  const lines = shown.flatMap(row => [`· ${row.title} (${row.context}, ${approvalLabels[row.approvalStatus] ?? row.approvalStatus})`,
    ...(row.decisions ? [`  결정: ${clip(row.decisions)}`] : []), ...(row.followups ? [`  후속 조치: ${clip(row.followups)}`] : [])])
  const head = rows.length > 3 ? `${kindLabel} ${rows.length}건을 찾았습니다. 날짜가 늦은 순으로 3건의 결정과 후속 조치입니다.` : `${kindLabel} ${rows.length}건을 찾았습니다.`
  return { kind: 'meeting', sources: rows.map(toSource), unavailable: false, criteria, answer: [head, ...lines].join('\n') }
}
