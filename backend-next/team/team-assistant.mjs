import { query } from '../db/db.mjs'
import { ApiError, body, seoulToday, text, validate } from '../lib/validation.mjs'
import { canViewAll, requireUser } from './team-auth.mjs'
import { mergeAssistantSources, vectorHits } from './assistant-vector.mjs'
import { dateFields, defaultScope, extractConditions, periodLabel, statuses, urgentWords, validateWorkContext, workPeriod, workQuestion } from './assistant-work-query.mjs'
import { approvalQuestion, helpQuestion, helpText, meetingQuestion, orgQuestion, readApprovals, readMeetings, readOrg } from './assistant-insights.mjs'
import { unassignedActiveCount, visibleTeamCounts, visibleTeamGroup } from './team-org.mjs'
import { decisionHistoryQuestion, readDecisionHistory } from './assistant-decision-history.mjs'

const factQuestion = /몇\s*(?:건|개|명|퍼센트|번)|비율|퍼센트|완료율|평균|합계|총합|통계|순위|누가|누구|팀장|명단|결재|승인\s*대기|실적/u
const commonWords = new Set(['일정', '업무', '회의', '언제', '언제였지', '어떻게', '알려줘', '찾아줘', '있어', '뭐야', '정리해줘', '진행', '지금', '내용'])
const headcountWord = /인원|팀\s*원|구성\s*원|임?\s*직원|사원|사람|몇\s*명|총\s*원|머릿\s*수/u
const notHeadcount = /업무|회의|일정|프로젝트|담당|맡|진행|완료|참석|누구|이름|명단|TSK-\d/iu
const ownDepartment = /^(?:우리|내|저희)(?:\s*(?:부서|팀))?$/u
const allDepartments = /^(?:우리\s*)?(?:(?:회사|전사|전체|모든|각)\s*)*(?:부서|팀|조직)?(?:\s*별)?$/u
const companyWide = /총|전체|회사|전사|직원|사원/u
const subjectTail = /\s*(?:의|에는|에|은|는|총|전체|모두|합계|합쳐서)\s*$/u
const departmentName = /(?:팀(?:\s*\([^)]{1,20}\))?|연구소|본부|센터|지사|실)$/u

// 인원 단어 앞부분을 대상 부서로 읽는다. 어미는 보지 않고, 업무·회의·명단 질문은 제외한다.
// 반환: { all: true }(조회 가능한 전체) | { name } | null(인원수 질문 아님)
function headcountTarget(question) {
  const trimmed = question.replace(/\s*[?!.？！。]+$/u, '').trim()
  const word = trimmed.match(headcountWord)
  if (!word || trimmed.length > 60 || notHeadcount.test(trimmed)) return null
  const before = trimmed.slice(0, word.index)
  let subject = before.replace(/^(?:현재|지금)\s*/u, '').trim()
  while (subjectTail.test(subject)) subject = subject.replace(subjectTail, '').trim()
  if (/^팀/u.test(word[0]) && subject && !/\s$/u.test(before)) subject += '팀'
  if (!subject) return companyWide.test(trimmed) ? { all: true } : null
  if (ownDepartment.test(subject)) return { name: '우리팀' }
  if (allDepartments.test(subject)) return { all: true }
  subject = subject.replace(/(\S)\s*부서$/u, '$1')
  return departmentName.test(subject) ? { name: subject.replace(/\s/gu, '') } : null
}

export const assistantSourceRows = `(
      SELECT CASE WHEN w.personal_owner_id IS NULL THEN CONCAT('work/',w.id,'?team=',w.team_id)
                  ELSE CONCAT('personal-work/',w.id) END AS route,
        w.id AS workId, w.personal_owner_id AS owner, w.team_id AS team,
        a.name AS assigneeName, w.status AS workStatus, w.start_date AS starts, w.completed_date AS completed, NULL AS approvalStatus,
        w.title, COALESCE(t.name,N'개인 캘린더') AS context, CONVERT(char(10),w.due_date,23) AS [date],
        CONCAT_WS(N' · ', NULLIF(w.company,N''), CONCAT(N'담당자 ',a.name),
          CONCAT(N'기간 ',CONVERT(char(10),w.start_date,23),N' ~ ',CONVERT(char(10),w.due_date,23)),
          CASE w.status WHEN 'DONE' THEN N'완료' WHEN 'IN_PROGRESS' THEN N'진행 중' ELSE N'대기' END,
          NULLIF(w.notes,N'')) AS excerpt
      FROM team_work w JOIN team_users a ON a.id=w.assignee_id LEFT JOIN teams t ON t.id=w.team_id
      UNION ALL
      SELECT CONCAT('team-reports?kind=',m.kind,'&date=',CONVERT(char(10),m.meeting_date,23),'&team=',m.team_id),
        NULL,NULL,m.team_id,NULL,NULL,NULL,NULL,m.approval_status,
        CONCAT(CONVERT(char(10),m.meeting_date,23),CASE m.kind WHEN 'daily' THEN N' 일일회의' ELSE N' 주간회의' END),
        t.name, CONVERT(char(10),m.meeting_date,23),
        CONCAT_WS(NCHAR(10), CASE WHEN m.agenda<>N'' THEN CONCAT(N'안건: ',CONVERT(nvarchar(max),m.agenda)) END,
          CASE WHEN m.decisions<>N'' THEN CONCAT(N'결정: ',m.decisions) END,
          CASE WHEN m.followups<>N'' THEN CONCAT(N'후속 조치: ',m.followups) END)
      FROM team_meetings m JOIN teams t ON t.id=m.team_id
    )`

const visibleTo = '(v.owner=@owner OR (v.owner IS NULL AND (@allTeams=1 OR v.team=@team)))'
const viewerScope = user => ({ owner: user.id, team: user.teamId, allTeams: canViewAll(user) ? 1 : 0 })
const sourceFields = 'v.route,v.title,v.context,v.[date],v.excerpt,v.approvalStatus'
const referencePrefix = /^(?:그거|그건|그\s*(?:업무|일정|회의|건))(?:는|은|이|가|의)?(?=\s|[?!.]|$)/u
const sourceRoute = /^(?:work\/\d+\?team=\d+|personal-work\/\d+|team-reports\?kind=(?:daily|weekly)&date=\d{4}-\d{2}-\d{2}&team=\d+)$/u

function referencesOf(value) {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > 5 || value.some(route => typeof route !== 'string' || route.length > 100 || !sourceRoute.test(route))) {
    validate('references')
  }
  return [...new Set(value)]
}

async function linkedSource(db, user, route) {
  const [source] = await query(db, `SELECT ${sourceFields} FROM ${assistantSourceRows} v
    WHERE ${visibleTo} AND v.route=@route`, { ...viewerScope(user), route })
  return source
}

function relevantExcerpt(excerpt, terms) {
  if (excerpt.length <= 1200) return excerpt
  const normalized = excerpt.toLocaleLowerCase('ko-KR')
  const position = terms.map(term => normalized.indexOf(term.toLocaleLowerCase('ko-KR'))).find(index => index >= 0) ?? 0
  const start = Math.max(0, position - 240)
  return excerpt.slice(start, start + 1200)
}

const approvalLabels = { APPROVED: '승인 완료', PENDING: '결재 대기', DRAFT: '초안' }

function evidenceFor(question, sources, terms) {
  const decisionQuestion = /확정|결정|승인|변경|바뀌|바뀐/u.test(question) && !/초안|처음\s*제안/u.test(question)
  const ordered = decisionQuestion
    ? [...sources].sort((first, second) => Number(second.approvalStatus === 'APPROVED') - Number(first.approvalStatus === 'APPROVED'))
    : sources
  return ordered.map(({ title, context, date, excerpt, approvalStatus }) => ({
    title, context, date, approvalStatus, recordState: approvalLabels[approvalStatus], excerpt: relevantExcerpt(excerpt, terms),
  }))
}

function diagnostics() {
  const start = performance.now()
  const spans = []
  return {
    async measure(name, operation) {
      const began = performance.now()
      try { return await operation() } finally { spans.push(`${name};dur=${(performance.now() - began).toFixed(1)}`) }
    },
    finish(response, mode, outcome = 'answered') {
      response.headers.set('X-Assistant-Mode', mode)
      response.headers.set('X-Assistant-Outcome', outcome)
      response.headers.set('Server-Timing', [...spans, `total;dur=${(performance.now() - start).toFixed(1)}`].join(', '))
      return response
    },
  }
}

// 생성 한도에 걸려 문장 중간에서 끊긴 답은 마지막으로 끝난 문장까지만 쓴다. 답 전체를 감싼 따옴표도 벗긴다.
export function completeSentences(raw) {
  let answer = raw.trim().slice(0, 2500).replace(/^["“](.*)["”]$/su, '$1').trim()
  // 작은 모델이 지시를 어기고 붙이는 인사말·자기소개 문장을 앞에서 걷어낸다.
  const preamble = /^(?:안녕하세요[^.!?\n]*[.!?]?|[^.!?\n]{0,40}(?:비서|담당자|팀)입니다[.!?]|저는[^.!?\n]{0,60}(?:있습니다|입니다)[.!?]|당신의 질문에 대한 답변은 다음과 같습니다\s*[:.]?)\s*/u
  for (let i = 0; i < 3 && preamble.test(answer); i++) answer = answer.replace(preamble, '').trim()
  if (answer && !/[.!?。)]$/u.test(answer)) {
    const end = Math.max(...['.', '!', '?', '。'].map(mark => answer.lastIndexOf(mark)))
    if (end > 0) answer = answer.slice(0, end + 1)
  }
  return answer || null
}

// 팀 이름은 공백을 무시하고 비교한다. '우리팀'은 질문자 팀, 정확히 같은 팀이 없는 'OO팀'은 이름 앞부분이 같은 팀 묶음이다.
const teamMatch = `(@teamKey IS NULL OR (v.owner IS NULL AND (
  REPLACE(v.context,N' ',N'')=@teamKey
  OR (@teamKey=N'우리팀' AND v.team=@team)
  OR (RIGHT(@teamKey,1)=N'팀' AND LEN(@teamKey)>2 AND NOT EXISTS (SELECT 1 FROM teams x WHERE REPLACE(x.name,N' ',N'')=@teamKey)
    AND LEFT(REPLACE(v.context,N' ',N''),LEN(@teamKey)-1)=LEFT(@teamKey,LEN(@teamKey)-1)))))`
// 데모처럼 'OOO (팀명)' 형식으로 저장된 이름도 같은 사람으로 본다.
const assigneeMatch = "(@name IS NULL OR v.assigneeName=@name OR v.assigneeName LIKE @name+N' (%')"

async function isPersonName(db, name) {
  const [row] = await query(db, "SELECT TOP (1) 1 AS found FROM team_users WHERE is_active=1 AND (name=@name OR name LIKE @name+N' (%')", { name })
  return !!row
}

// 업무 조회 조건을 SQL로 바꾼다. 목록·집계·완료율이 같은 조건을 쓴다.
function workFilter(user, filters, today, { ignoreStatus = false, dateFieldOverride = null } = {}) {
  const { name, team: teamName, keyword, exclude, status } = filters
  // "이번 주 지연 업무"는 그 기간에 마감된 것이 아니라 지금 기한이 지난 업무를 뜻한다.
  const currentOverdue = status === 'overdue' && ['today', 'thisWeek', 'thisMonth'].includes(filters.period)
  const period = currentOverdue ? null : filters.period
  const range = workPeriod(period, today)
  const dateField = dateFieldOverride ?? (filters.dateField === 'overlap' && status === 'done' ? 'completed' : filters.dateField)
  const statusSql = { open: "v.workStatus<>'DONE'", done: "v.workStatus='DONE'",
    waiting: "v.workStatus='WAITING'", progress: "v.workStatus='IN_PROGRESS'", overdue: "v.workStatus<>'DONE' AND v.[date]<@today", all: '1=1' }
  const dateSql = { due: 'v.[date] BETWEEN @from AND @to', start: 'v.starts BETWEEN @from AND @to',
    completed: 'v.completed BETWEEN @from AND @to', overlap: 'v.starts<=@to AND v.[date]>=@from' }
  const keywords = keyword ? keyword.split(' ').slice(0, 2) : []
  const sql = `${visibleTo} AND v.workId IS NOT NULL AND ${assigneeMatch} AND ${teamMatch}
    ${keywords.map((_, i) => `AND (CHARINDEX(@kw${i},v.title)>0 OR CHARINDEX(@kw${i},v.excerpt)>0)`).join(' ')}
    ${exclude ? 'AND CHARINDEX(@exclude,v.title)=0 AND CHARINDEX(@exclude,v.excerpt)=0' : ''}
    AND ${ignoreStatus ? '1=1' : statusSql[status]}${range ? ' AND ' + dateSql[dateField] : ''}`
  const params = { ...viewerScope(user), name, teamKey: teamName?.replace(/\s/gu, '') ?? null, today, exclude,
    ...Object.fromEntries(keywords.map((word, i) => ['kw' + i, word])), ...(range ? { from: range[0], to: range[1] } : {}) }
  const rangeLabel = range && `${periodLabel(period)} ${dateFields[dateField]} (${range[0]}${range[0] === range[1] ? '' : ' ~ ' + range[1]})`
  const criteria = [name, teamName, keyword && `‘${keyword}’ 포함`, exclude && `‘${exclude}’ 제외`, rangeLabel,
    !ignoreStatus && (currentOverdue ? `현재 기한 초과 (${today} 기준)` : statuses[status])].filter(Boolean)
  return { sql, params, range, criteria, period }
}

const daysBetween = (from, to) => Math.round((new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000)
const dueText = (date, today) => {
  const days = daysBetween(today, date)
  return days < 0 ? `${-days}일 지남` : days === 0 ? '오늘 마감' : `${days}일 남음`
}

// 사용자가 쓴 팀 표기('우리팀', '솔루션개발2팀')를 조직의 실제 팀 이름으로 바꿔 보여준다.
async function teamLabel(db, user, teamName) {
  if (!teamName) return null
  const rows = await query(db, "SELECT name FROM teams WHERE REPLACE(name,N' ',N'')=@key OR (@key=N'우리팀' AND id=@team)",
    { key: teamName.replace(/\s/gu, ''), team: user.teamId })
  return rows.length === 1 ? rows[0].name : teamName
}

// 비관리자가 다른 팀을 물어 0건이면 권한 때문인지 알려 준다.
async function otherTeamOnly(db, user, teamName) {
  if (!teamName || canViewAll(user) || teamName === '우리팀') return false
  const key = teamName.replace(/\s/gu, '')
  const rows = await query(db, `SELECT TOP (1) id FROM teams WHERE id<>ISNULL(@team,0) AND (REPLACE(name,N' ',N'')=@key
    OR (RIGHT(@key,1)=N'팀' AND LEFT(REPLACE(name,N' ',N''),LEN(@key)-1)=LEFT(@key,LEN(@key)-1)))`, { key, team: user.teamId })
  return rows.length > 0
}

const topic = word => { const code = word.charCodeAt(word.length - 1) - 0xAC00; return code >= 0 && code <= 11171 && code % 28 ? '은' : '는' }

async function assignedWork(db, user, filters, { urgent = false } = {}) {
  const { name, keyword, status } = filters
  const today = seoulToday()
  const { sql, params, range, criteria: rawCriteria, period } = workFilter(user, filters, today)
  const teamName = await teamLabel(db, user, filters.team)
  const criteria = rawCriteria.map(item => item === filters.team ? teamName : item)
  const sources = await query(db, `SELECT v.route,v.title,v.context,v.[date],v.excerpt
    FROM ${assistantSourceRows} v WHERE ${sql} ORDER BY v.[date],v.workId`, params)
  if (!sources.length) {
    const denied = await otherTeamOnly(db, user, filters.team)
    return { kind: 'assignment', sources, criteria, context: filters, unavailable: false,
      answer: denied ? `${teamName}${topic(teamName)} 열람 권한이 없는 팀입니다. 소속 팀과 본인 개인 업무만 볼 수 있습니다.` : '선택한 조건에 맞는 업무를 열람 범위에서 찾지 못했습니다.' }
  }
  const head = `${name ? name + '님의 ' : ''}${teamName ? teamName + ' ' : ''}${keyword ? `‘${keyword}’ 관련 ` : ''}${range ? periodLabel(period) + ' ' : ''}${status === 'overdue' && !range ? '현재 기한 초과' : statuses[status]} 업무 ${sources.length}건을 찾았습니다.`
  // 마감일 순으로 정렬돼 있으므로 맨 앞이 가장 급한 업무다.
  const lines = urgent
    ? [`가장 급한 업무는 ${sources[0].title}(${sources[0].context}, 마감 ${sources[0].date}, ${dueText(sources[0].date, today)})입니다.`,
      ...sources.slice(1, 3).map(item => `· 다음: ${item.title} (마감 ${item.date}, ${dueText(item.date, today)})`)]
    : [...(() => {
      const teams = Object.entries(Object.groupBy(sources, item => item.context)).map(([team, items]) => `${team} ${items.length}건`)
      return teams.length > 1 ? [`· 팀별: ${teams.join(' · ')}`] : []
    })(), `· 가장 이른 마감: ${sources[0].title} (${sources[0].date}, ${dueText(sources[0].date, today)})`]
  return { kind: 'assignment', sources, criteria, context: filters, unavailable: false, answer: [head, ...lines].join('\n') }
}

// ── 집계: 팀별·담당자별 건수, 완료율 ──
const aggregateAsk = /팀\s*별|부서\s*별|담당자\s*별|팀원\s*별|사람\s*별|인원\s*별|누구\s*(?:거|꺼|것)|누가\s*(?:제일|가장)?\s*많|누구한테|(?:가장|제일)\s*(?:\S+\s*)?많|어느\s*팀|완료율|달성률|진척률|퍼센트|비율/u
const rateAsk = /완료율|달성률|진척률|퍼센트|비율/u
const aggregateWords = /팀\s*별로?|부서\s*별로?|담당자\s*별로?|팀원\s*별로?|사람\s*별로?|인원\s*별로?|누구\s*(?:거|꺼|것)\S*|누가\s*(?:제일|가장)?\s*많\S*|누구한테\S*|(?:가장|제일)|많은?(?=\s|$)|많아\S*|(?<=^|\s)팀(?:은|이)(?=\s|$)|어느\s*팀\S*|완료율\S*|달성률\S*|진척률\S*|몇\s*퍼센트\S*|퍼센트\S*|비율\S*|몇\s*(?:건|개)\S*|건수\S*|개수\S*/gu

async function aggregateWork(db, user, question, context) {
  const cleaned = question.replace(aggregateWords, ' ').replace(/\s+/gu, ' ').trim()
  // 집계는 "그중"으로 시작할 때만 앞 대화 조건을 이어 쓴다. 그렇지 않으면 이전 조건이 섞여 엉뚱한 0건이 나온다.
  const previous = /^그\s*중/u.test(question.trim()) ? context : null
  const filters = workQuestion(cleaned, previous, user.name) ?? workQuestion(`${cleaned} 업무`, null, user.name) ?? { ...defaultScope }
  const today = seoulToday()
  if (rateAsk.test(question)) {
    const scoped = filters.period ? filters : { ...filters, period: 'thisWeek' }
    const { sql, params, criteria } = workFilter(user, scoped, today, { ignoreStatus: true, dateFieldOverride: 'due' })
    const byTeam = /팀\s*별|부서\s*별/u.test(question)
    const rows = await query(db, `SELECT ${byTeam ? 'v.context AS label,' : ''}COUNT(*) AS total,
      SUM(CASE WHEN v.workStatus='DONE' THEN 1 ELSE 0 END) AS done
      FROM ${assistantSourceRows} v WHERE ${sql} ${byTeam ? 'GROUP BY v.context ORDER BY v.context' : ''}`, params)
    const rate = row => row.total ? `${Math.round(row.done / row.total * 100)}% (${row.done}/${row.total}건)` : '대상 업무 없음'
    const answer = byTeam
      ? [`팀별 완료율입니다(마감일이 기간 안인 업무 중 완료 비율).`, ...rows.map(row => `· ${row.label}: ${rate(row)}`)].join('\n')
      : `완료율은 ${rate(rows[0])}입니다. 마감일이 기간 안인 업무 중 완료한 비율입니다.`
    return { kind: 'stats', sources: [], unavailable: false, criteria: [...criteria, '완료 비율'], context: scoped, answer }
  }
  const byAssignee = /담당자\s*별|팀원\s*별|사람\s*별|인원\s*별|누구|누가/u.test(question) || !(/팀\s*별|부서\s*별|어느\s*팀|팀은|팀이/u.test(question) || canViewAll(user))
  const { sql, params, criteria } = workFilter(user, filters, today)
  const rows = await query(db, `SELECT ${byAssignee ? 'v.assigneeName' : 'v.context'} AS label, COUNT(*) AS count
    FROM ${assistantSourceRows} v WHERE ${sql} GROUP BY ${byAssignee ? 'v.assigneeName' : 'v.context'} ORDER BY count DESC, label`, params)
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const unit = byAssignee ? '담당자별' : '팀별'
  const leaders = rows.filter(row => row.count === rows[0]?.count)
  const who = byAssignee ? '담당자는' : '팀은'
  const top = leaders.length === rows.length && rows.length > 1 ? `모든 ${byAssignee ? '담당자가' : '팀이'} ${rows[0].count}건으로 같습니다.`
    : leaders.length > 1 ? `가장 많은 ${who} ${leaders.map(row => row.label).join(', ')}(각 ${rows[0].count}건)입니다.`
      : `가장 많은 ${who} ${rows[0]?.label}(${rows[0]?.count}건)입니다.`
  const answer = rows.length
    ? [`${unit} ${statuses[filters.status]} 업무입니다(총 ${total}건). ${top}`,
      ...rows.slice(0, 15).map(row => `· ${row.label} ${row.count}건`), ...(rows.length > 15 ? [`· 외 ${rows.length - 15}곳`] : [])].join('\n')
    : '선택한 조건에 맞는 업무를 열람 범위에서 찾지 못했습니다.'
  return { kind: 'stats', sources: [], unavailable: false, criteria: [...criteria, unit], context: filters, answer }
}

// 앞서 나온 여러 업무의 마감일·담당자를 한 번에 답한다("그거 마감 언제야?").
async function referencedWork(db, user, routes) {
  return query(db, `SELECT v.route,v.title,v.context,v.[date],v.excerpt,v.assigneeName FROM ${assistantSourceRows} v
    WHERE ${visibleTo} AND v.workId IS NOT NULL AND v.route IN (SELECT value FROM OPENJSON(@routes)) ORDER BY v.[date]`,
  { ...viewerScope(user), routes: JSON.stringify(routes) })
}

async function findSources(db, user, terms, workId, hits, timing) {
  const params = viewerScope(user)
  const projection = sourceFields + ',v.owner,v.team'
  const keywords = async () => {
    if (!terms.length && !workId) return []
    const bindings = { ...params, workId }
    const scores = ['CASE WHEN v.workId=@workId THEN 100 ELSE 0 END', ...terms.map((term, i) => {
      const key = 'term' + i
      bindings[key] = term
      return `CASE WHEN CHARINDEX(@${key},v.title)>0 THEN 3
        WHEN CHARINDEX(@${key},v.excerpt)>0 THEN 1 ELSE 0 END`
    })]
    return query(db, `SELECT TOP (5) ${projection} FROM ${assistantSourceRows} v
      CROSS APPLY (VALUES (${scores.join(' + ')})) rank(points)
      WHERE ${visibleTo} AND rank.points>0 ORDER BY rank.points DESC,v.[date] DESC,v.route`, bindings)
  }
  const [exact, semantic] = await Promise.all([timing ? timing.measure('keyword', keywords) : keywords(), hits])
  const current = semantic.length ? await query(db, `SELECT ${projection} FROM ${assistantSourceRows} v
      WHERE ${visibleTo} AND v.route IN (SELECT value FROM OPENJSON(@routes))`,
    { ...params, routes: JSON.stringify(semantic.map(hit => hit.route)) }) : []
  return mergeAssistantSources(exact, current, semantic).map(({ route, title, context, date, excerpt, approvalStatus }) =>
    ({ route, title, context, date, excerpt, ...(approvalStatus && { approvalStatus }) }))
}

// 인원수 질문에 DB 값으로 답한다.
async function headcountResult(db, user, countTarget, timing) {
  if (countTarget?.all) {
    const [teams, unassigned] = await timing.measure('sql', () => Promise.all([
      visibleTeamCounts(db, user, null), canViewAll(user) ? unassignedActiveCount(db) : null]))
    const members = teams.reduce((sum, team) => sum + team.memberCount, 0)
    const lines = teams.map(team => `· ${team.name} ${team.memberCount}명`)
    // 전체 조회 권한이 있으면 부서 미소속(대표·본부장 등)까지 더한 회사 전체 사원 수를 답한다.
    const answer = unassigned != null
      ? [`현재 활성 사원은 총 ${members + unassigned}명입니다. 부서 소속 ${members}명${unassigned ? `, 부서 미소속 ${unassigned}명` : ''}입니다.`,
        ...lines, ...(unassigned ? [`· 부서 미소속 ${unassigned}명`] : [])].join('\n')
      : teams.length ? [`열람할 수 있는 ${teams.length}개 부서의 현재 활성 구성원은 총 ${members}명입니다.`, ...lines].join('\n')
        : '열람할 수 있는 부서가 없습니다.'
    return { sources: [], answer, unavailable: false, criteria: ['활성 계정 기준'] }
  }
  if (countTarget) {
    const teams = await timing.measure('sql', () => visibleTeamCounts(db, user, countTarget.name))
    // '솔루션개발팀'처럼 정확히 같은 부서가 없으면 이름 앞부분이 같은 부서 묶음(솔루션개발 1팀·2팀)을 합산한다.
    const stem = countTarget.name.replace(/팀$/u, '')
    if (!teams.length && stem !== countTarget.name && stem.length >= 2 && stem !== '우리') {
      const group = await timing.measure('sql', () => visibleTeamGroup(db, user, stem))
      if (group.length) {
        const total = group.reduce((sum, team) => sum + team.memberCount, 0)
        const scope = canViewAll(user) ? '' : '열람할 수 있는 '
        const answer = [`${stem}팀 전체(${scope}${group.length}개 부서)의 현재 활성 구성원은 총 ${total}명입니다.`,
          ...group.map(team => `· ${team.name} ${team.memberCount}명`)].join('\n')
        return { sources: [], answer, unavailable: false, criteria: ['활성 소속 구성원 기준'] }
      }
    }
    const team = teams.length === 1 ? teams[0] : null
    const answer = team ? `${team.name}의 현재 활성 구성원은 ${team.memberCount}명입니다.`
      : teams.length > 1 ? '어느 팀을 뜻하는지 팀 이름을 한 번 더 알려주세요.'
        : '열람할 수 있는 팀 범위에서 해당 팀을 찾지 못했습니다.'
    return { sources: [], answer, unavailable: false, ...(team && { criteria: ['활성 소속 구성원 기준'] }) }
  }
}

export async function assistant(db, request, user) {
  const timing = diagnostics()
  const input = await body(request, ['question', 'context', 'references'])
  const question = text(input.question, 'question', 500, true)
  const context = validateWorkContext(input.context)
  const today = seoulToday()
  const structured = (result, mode = 'structured', outcome) => timing.finish(Response.json(result), mode, outcome)
  if (helpQuestion(question)) return structured({ kind: 'help', sources: [], answer: helpText, unavailable: false }, 'help')

  // "솔루션개발 1팀 인원이랑 이번 주 업무"처럼 인원과 업무를 함께 물으면 두 답을 이어 붙인다.
  const compound = question.match(/(인원|구성원\s*수|몇\s*명)\s*(?:이랑|랑|하고|과|및|,|그리고)\s*/u)
  if (compound) {
    const target = headcountTarget(question.slice(0, compound.index + compound[1].length))
    const filters = workQuestion(question.replace(compound[0], ' '), null, user.name, today)
    if (target && filters) {
      const head = await timing.measure('sql', () => headcountResult(db, user, target, timing))
      const work = await timing.measure('sql', () => assignedWork(db, user, filters))
      return structured({ ...work, answer: head.answer + '\n\n' + work.answer })
    }
  }
  const countTarget = headcountTarget(question)
  if (countTarget) return structured(await headcountResult(db, user, countTarget, timing))

  // 앞서 나온 업무들의 마감일·담당자는 원문을 다시 읽어 바로 답한다.
  const prefix = question.match(referencePrefix)?.[0]
  const routes = referencesOf(input.references)
  if (prefix && routes.length && /마감|언제\s*까지|담당|누가|누구/u.test(question) && !/왜|이유|변경|미뤘|바뀌/u.test(question)) {
    const works = await timing.measure('reference', () => referencedWork(db, user, routes))
    if (works.length) {
      const owner = /담당|누가|누구/u.test(question)
      const line = item => owner ? item.title + ': 담당자 ' + item.assigneeName : item.title + ': 마감 ' + item.date + ' (' + dueText(item.date, today) + ')'
      const answer = works.length === 1
        ? owner ? works[0].title + ' 담당자는 ' + works[0].assigneeName + '입니다.' : works[0].title + '의 마감일은 ' + works[0].date + '(' + dueText(works[0].date, today) + ')입니다.'
        : ['앞서 나온 업무 ' + works.length + '건의 ' + (owner ? '담당자' : '마감일') + '입니다.', ...works.map(item => '· ' + line(item))].join('\n')
      return structured({ kind: 'assignment', unavailable: false, answer, context: context ?? undefined,
        sources: works.map(({ route, title, context: team, date, excerpt }) => ({ route, title, context: team, date, excerpt })) }, 'reference')
    }
  }

  // "다른 팀 업무도 볼 수 있어?"처럼 권한을 물으면 현재 계정의 열람 범위를 답하고, 함께 물은 업무 조회도 이어 붙인다.
  if (/(?:볼|조회할|열람할|확인할)\s*수\s*있|권한/u.test(question)) {
    const note = canViewAll(user) ? '현재 계정은 관리자 권한이 있어 모든 팀의 업무·회의를 읽기 전용으로 볼 수 있습니다.'
      : '현재 계정은 소속 팀과 본인 개인 업무·회의만 볼 수 있습니다. 다른 팀 업무는 관리자만 볼 수 있습니다.'
    const rest = question.split(/[?？]/u).filter(part => !/(?:볼|조회할|열람할|확인할)\s*수\s*있|권한/u.test(part)).join(' ').trim()
    const filters = rest && workQuestion(rest, null, user.name, today)
    if (!filters) return structured({ sources: [], answer: note, unavailable: false }, 'structured', 'permission')
    const work = await timing.measure('sql', () => assignedWork(db, user, filters))
    return structured({ ...work, answer: note + '\n\n' + work.answer })
  }
  const org = orgQuestion(question)
  if (org) return structured(await timing.measure('sql', () => readOrg(db, user, org)))
  if (approvalQuestion(question)) return structured(await timing.measure('sql', () => readApprovals(db, user, question, today)))
  if (aggregateAsk.test(question) && !/회의/u.test(question)) return structured(await timing.measure('sql', () => aggregateWork(db, user, question, context)))
  if (meetingQuestion(question)) {
    const meetings = await timing.measure('sql', () => readMeetings(db, user, question, today))
    if (meetings?.missingKeyword) {
      // 회의록에 없는 내용을 모델이 업무 메모로 꾸며 말하지 않도록, 없다고 밝히고 관련 업무를 보여준다.
      const work = await timing.measure('sql', () => assignedWork(db, user, { ...defaultScope, keyword: meetings.missingKeyword, status: 'all' }))
      if (work.sources.length) return structured({ ...work, answer: `‘${meetings.missingKeyword}’가 언급된 회의록은 찾지 못했습니다. 대신 관련 업무입니다.\n${work.answer}` })
    } else if (meetings) return structured(meetings)
  }

  if (!context && /^그\s*중/u.test(question)) {
    return structured({ kind: 'assignment', sources: [], answer: '어떤 업무를 기준으로 볼까요? 담당자나 팀을 함께 알려주세요.', unavailable: false }, 'context', 'clarify')
  }
  const urgent = urgentWords.test(question)
  let filters = workQuestion(question, context, user.name, today)
  // "제일 급한 거 뭐야?"처럼 조건 없이 물으면 내 미완료 업무에서 고른다.
  if (!filters && urgent) filters = context ?? { ...defaultScope, name: user.name }
  // 남은 한 단어가 사람 이름이면 담당자 조건으로 바꾼다("이민준 이번주 업무").
  if (filters?.keyword && !filters.name && !filters.keyword.includes(' ')
    && await timing.measure('sql', () => isPersonName(db, filters.keyword))) filters = { ...filters, name: filters.keyword, keyword: null }
  if (filters) {
    const result = await timing.measure('sql', () => assignedWork(db, user, filters, { urgent }))
    // 키워드로 좁혔는데 업무가 없으면 단정하지 않고 원문 검색으로 넘긴다.
    if (result.sources.length || !filters.keyword) return structured(result)
  }
  let reference = null
  if (prefix) {
    reference = routes.length === 1 ? await timing.measure('reference', () => linkedSource(db, user, routes[0])) : null
    if (!reference) {
      const answer = routes.length > 1 ? '앞서 나온 원문이 여러 건입니다. 어느 업무나 회의인지 제목이나 업무 번호를 알려주세요.'
        : '어느 업무나 회의를 말씀하시는지 제목이나 업무 번호를 알려주세요.'
      return structured({ sources: [], answer, unavailable: false, context: context ?? undefined }, 'reference', 'clarify')
    }
  }
  const requestedId = Number(question.match(/\bTSK-([0-9]{1,10})\b/i)?.[1])
  const workId = requestedId > 0 && requestedId <= 2147483647 ? requestedId : null
  if (decisionHistoryQuestion(question) && (workId || !reference?.route.startsWith('team-reports'))) {
    const result = await timing.measure('sql', () => readDecisionHistory(db, user, question, workId, reference))
    return timing.finish(Response.json(result), 'history', result.evidence ? 'answered' : 'clarify')
  }
  const searchQuestion = reference ? `${reference.title} ${question.slice(prefix.length).trim()}` : question
  const terms = [...new Set((searchQuestion.match(/[\p{L}\p{N}-]{2,}/gu) ?? [])
    .map(word => word.replace(/(?:에서는|에서|에게|으로|까지|부터|은|는|을|를|이|가)$/u, match => word.length - match.length >= 2 ? '' : match))
    .filter(word => !commonWords.has(word)))].slice(0, 12)
  const hits = timing.measure('vector', () => vectorHits(searchQuestion, user, request.signal))
  const prependReference = (source, sources) => source ? [source, ...sources.filter(item => item.route !== source.route)].slice(0, 5) : sources
  // 질문에 기간이 있으면 그 기간의 원문만 남긴다(없으면 전체). 같은 규칙을 재확인 결과에도 적용한다.
  const askedRange = workPeriod(extractConditions(question, { today }).period, today)
  const inRange = items => {
    if (!askedRange) return items
    const matched = items.filter(item => item.date >= askedRange[0] && item.date <= askedRange[1])
    return matched.length ? matched : items
  }
  const sources = inRange(prependReference(reference, await timing.measure('retrieval', () => findSources(db, user, terms, workId, hits, timing))))
  if (!sources.length) return timing.finish(Response.json({ sources, answer: null, unavailable: false }), 'rag', 'no-source')
  // 건수·비율·사람·결재처럼 정확한 값을 묻는데 위 조회로 답하지 못한 질문은 모델이 숫자·이름을 지어내지 않게 원문만 보여준다.
  if (factQuestion.test(question)) {
    return timing.finish(Response.json({ sources, unavailable: false,
      answer: '이 질문은 기록에서 정확한 숫자나 사람을 계산해 드릴 수 없어 관련 원문만 보여드립니다.\n' + helpText.split('\n').slice(1, 6).join('\n') }), 'rag', 'fact-guard')
  }

  let answer = null
  try {
    answer = await timing.measure('generation', async () => {
      const result = await fetch(new URL('/generate', process.env.AI_SERVICE_URL ?? 'http://ai:8000'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(25000)]),
        body: JSON.stringify({ grounded: true, prompt: JSON.stringify({
          question, environment: { date: seoulToday(), timeZone: 'Asia/Seoul' },
          ...(reference && { previousSubject: reference.title }),
          sources: evidenceFor(question, sources, terms),
        }) }),
      })
      if (!result.ok) return null
      const data = await result.json()
      return typeof data.response === 'string' ? completeSentences(data.response) : null
    })
  } catch {
    // 모델을 기다리다 실패해도 사용자는 현재 원문을 확인할 수 있습니다.
  }

  const viewer = await requireUser(db, request)
  if (viewer.id !== user.id) throw new ApiError(403, 'FORBIDDEN', '질문을 다시 제출해 주세요.')
  const latest = await timing.measure('recheck', async () => {
    const freshReference = reference && await linkedSource(db, viewer, reference.route)
    if (reference && !freshReference) return []
    return inRange(prependReference(freshReference, await findSources(db, viewer, terms, workId, hits)))
  })
  const changed = JSON.stringify(latest) !== JSON.stringify(sources)
  if (changed) answer = null
  return timing.finish(Response.json({ sources: latest, answer, unavailable: latest.length > 0 && !answer }), 'rag',
    changed ? 'sources-changed' : answer ? 'answered' : 'generation-unavailable')
}
