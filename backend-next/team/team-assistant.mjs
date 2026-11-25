import { query } from '../db/db.mjs'
import { ApiError, body, seoulToday, text, validate } from '../lib/validation.mjs'
import { canViewAll, requireUser } from './team-auth.mjs'
import { mergeAssistantSources, vectorHits } from './assistant-vector.mjs'
import { dateFields, periodLabel, statuses, validateWorkContext, workPeriod, workQuestion } from './assistant-work-query.mjs'
import { visibleTeamCounts } from './team-org.mjs'

const commonWords = new Set(['일정', '업무', '회의', '언제', '언제였지', '어떻게', '알려줘', '찾아줘', '있어', '뭐야', '정리해줘', '진행', '지금', '내용'])
const teamCountQuestion = /^(?:(?:현재|지금)\s*)?([\p{L}\p{N}· ]{1,55}?팀(?:\s*\([^)]{1,20}\))?)(?:의|은|는)?\s*(?:팀원\s*수?|구성원\s*수?|인원\s*수?|몇\s*명)(?:가|은|는|이)?\s*(?:몇\s*명(?:이야|인가요|이지|이에요|이죠|이니)?|이야|인가요|이에요|알려\s*(?:줘|주세요))?[?!.]*$/u

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

async function assignedWork(db, user, filters) {
  const { name, team: teamName, status, period } = filters
  const today = seoulToday()
  const range = workPeriod(period, today)
  const dateField = filters.dateField === 'overlap' && status === 'done' ? 'completed' : filters.dateField
  const statusSql = { open: "v.workStatus<>'DONE'", done: "v.workStatus='DONE'",
    waiting: "v.workStatus='WAITING'", progress: "v.workStatus='IN_PROGRESS'", overdue: "v.workStatus<>'DONE' AND v.[date]<@today", all: '1=1' }
  const dateSql = { due: 'v.[date] BETWEEN @from AND @to', start: 'v.starts BETWEEN @from AND @to',
    completed: 'v.completed BETWEEN @from AND @to', overlap: 'v.starts<=@to AND v.[date]>=@from' }
  const sources = await query(db, `SELECT v.route,v.title,v.context,v.[date],v.excerpt
    FROM ${assistantSourceRows} v WHERE ${visibleTo} AND v.workId IS NOT NULL
      AND (@name IS NULL OR v.assigneeName=@name) AND (@teamName IS NULL OR (v.owner IS NULL AND v.context=@teamName))
      AND ${statusSql[status]}${range ? ' AND ' + dateSql[dateField] : ''}
    ORDER BY v.[date],v.workId`, { ...viewerScope(user), name, teamName, today, ...(range ? { from: range[0], to: range[1] } : {}) })
  const criteria = [name, teamName, range && `${periodLabel(period)} ${dateFields[dateField]} (${range[0]}${range[0] === range[1] ? '' : ' ~ ' + range[1]})`, statuses[status]].filter(Boolean)
  const answer = sources.length ? `${name ? name + '님의 ' : ''}${statuses[status]} 업무 ${sources.length}건을 찾았습니다.`
    : '선택한 조건에 맞는 업무를 열람 범위에서 찾지 못했습니다.'
  return Response.json({ kind: 'assignment', sources, answer, criteria, context: filters, unavailable: false })
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

export async function assistant(db, request, user) {
  const timing = diagnostics()
  const input = await body(request, ['question', 'context', 'references'])
  const question = text(input.question, 'question', 500, true)
  const context = validateWorkContext(input.context)
  const countTeam = question.match(teamCountQuestion)?.[1]
  if (countTeam) {
    const teams = await timing.measure('sql', () => visibleTeamCounts(db, user, countTeam.replace(/\s/gu, '')))
    const team = teams.length === 1 ? teams[0] : null
    const answer = team ? `${team.name}의 현재 활성 구성원은 ${team.memberCount}명입니다.`
      : teams.length > 1 ? '어느 팀을 뜻하는지 팀 이름을 한 번 더 알려주세요.'
        : '열람할 수 있는 팀 범위에서 해당 팀을 찾지 못했습니다.'
    return timing.finish(Response.json({ sources: [], answer, unavailable: false, ...(team && { criteria: ['활성 소속 구성원 기준'] }) }), 'structured')
  }
  if (!context && /^그\s*중/u.test(question)) {
    return timing.finish(Response.json({ kind: 'assignment', sources: [], answer: '어떤 업무를 기준으로 볼까요? 담당자나 팀을 함께 알려주세요.', unavailable: false }), 'context', 'clarify')
  }
  const filters = workQuestion(question, context)
  if (filters) return timing.finish(await timing.measure('sql', () => assignedWork(db, user, filters)), 'structured')
  const prefix = question.match(referencePrefix)?.[0]
  const routes = referencesOf(input.references)
  let reference = null
  if (prefix) {
    reference = routes.length === 1 ? await timing.measure('reference', () => linkedSource(db, user, routes[0])) : null
    if (!reference) {
      const answer = routes.length > 1 ? '앞서 나온 원문이 여러 건입니다. 어느 업무나 회의인지 제목이나 업무 번호를 알려주세요.'
        : '어느 업무나 회의를 말씀하시는지 제목이나 업무 번호를 알려주세요.'
      return timing.finish(Response.json({ sources: [], answer, unavailable: false }), 'reference', 'clarify')
    }
    if (!reference.route.startsWith('team-reports') && /언제\s*까지|마감일/u.test(question) && !/왜|이유|변경|미뤘/u.test(question)) {
      return timing.finish(Response.json({ kind: 'assignment', sources: [reference], unavailable: false,
        answer: `${reference.title}의 마감일은 ${reference.date}입니다.` }), 'reference')
    }
  }
  const searchQuestion = reference ? `${reference.title} ${question.slice(prefix.length).trim()}` : question
  const terms = [...new Set((searchQuestion.match(/[\p{L}\p{N}-]{2,}/gu) ?? [])
    .map(word => word.replace(/(?:에서는|에서|에게|으로|까지|부터|은|는|을|를|이|가)$/u, match => word.length - match.length >= 2 ? '' : match))
    .filter(word => !commonWords.has(word)))].slice(0, 12)
  const requestedId = Number(question.match(/\bTSK-([0-9]{1,10})\b/i)?.[1])
  const workId = requestedId > 0 && requestedId <= 2147483647 ? requestedId : null
  const hits = timing.measure('vector', () => vectorHits(searchQuestion, user, request.signal))
  const prependReference = (source, sources) => source ? [source, ...sources.filter(item => item.route !== source.route)].slice(0, 5) : sources
  const sources = prependReference(reference, await timing.measure('retrieval', () => findSources(db, user, terms, workId, hits, timing)))
  if (!sources.length) return timing.finish(Response.json({ sources, answer: null, unavailable: false }), 'rag', 'no-source')

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
      return typeof data.response === 'string' ? data.response.trim().slice(0, 2500) || null : null
    })
  } catch {
    // 모델을 기다리다 실패해도 사용자는 현재 원문을 확인할 수 있습니다.
  }

  const viewer = await requireUser(db, request)
  if (viewer.id !== user.id) throw new ApiError(403, 'FORBIDDEN', '질문을 다시 제출해 주세요.')
  const latest = await timing.measure('recheck', async () => {
    const freshReference = reference && await linkedSource(db, viewer, reference.route)
    if (reference && !freshReference) return []
    return prependReference(freshReference, await findSources(db, viewer, terms, workId, hits))
  })
  const changed = JSON.stringify(latest) !== JSON.stringify(sources)
  if (changed) answer = null
  return timing.finish(Response.json({ sources: latest, answer, unavailable: latest.length > 0 && !answer }), 'rag',
    changed ? 'sources-changed' : answer ? 'answered' : 'generation-unavailable')
}
