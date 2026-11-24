import { query, transaction } from './db.mjs'
import { found } from './http.mjs'
import { workAttachments } from './team-work-files.mjs'
import { canManageTeam } from './team-auth.mjs'
import { ApiError, body, calendarMonth, choice, date, invalid, queryKeys, seoulToday, shiftDay, text, validate } from './validation.mjs'

// 팀 유형별 업무 구분입니다. MEETING은 영업형에서 '업무협의', 다른 유형에서 '회의'로 표시합니다.
export const categoriesByKind = {
  SALES: ['QUOTE', 'DELIVERY', 'MEETING', 'OTHER'],
  DEV: ['DEVELOP', 'TEST', 'FIELD', 'MEETING', 'OTHER'],
  TECH: ['DEVELOP', 'TEST', 'FIELD', 'MEETING', 'OTHER'],
  SUPPORT: ['PURCHASE', 'APPROVAL', 'HR', 'ACCOUNTING', 'OTHER'],
}
const categories = [...new Set(Object.values(categoriesByKind).flat())]
export const alertOptions = ['90일 전', '30일 전', '7일 전', '3일 전', '1일 전', '당일']
const statuses = ['WAITING', 'IN_PROGRESS', 'DONE']
const fields = ['title', 'company', 'category', 'startDate', 'dueDate', 'notes', 'status', 'assigneeId', 'time', 'endTime', 'alerts', 'repeat']
const deliveryFields = ['title', 'startDate', 'dueDate', 'assigneeId', 'time', 'endTime', 'alerts', 'repeat']
const projection = `w.id,w.title,w.company,w.category,w.notes,w.status,w.assignee_id AS assigneeId,
  w.created_by AS createdBy,creator.name AS createdByName,w.created_at AS createdAt,
  u.name AS assigneeName,w.source_quote_id AS sourceQuoteId,CONVERT(char(10),w.start_date,23) AS startDate,
  CONVERT(char(10),w.due_date,23) AS dueDate,CONVERT(char(10),w.completed_date,23) AS completedDate,
  CONVERT(char(5),w.work_time,108) AS time,CONVERT(char(5),w.end_time,108) AS endTime,
  w.reminder_offsets AS alertJson,w.reminder_repeat AS repeat`
const forbidden = () => new ApiError(403, 'FORBIDDEN', '업무를 변경할 권한이 없습니다.')

// scope는 { team: 팀 ID } 또는 { owner: 개인 공간 소유자 ID }입니다. 모든 업무 조회는 둘 중 하나로 범위를 제한합니다.
export async function teamDashboard(db, scope) {
  const today = seoulToday()
  const weekEnd = shiftDay(today, (7 - new Date(today).getUTCDay()) % 7)
  const [, monthEnd] = calendarMonth(new URLSearchParams({ month: today.slice(0, 7) }))
  const end = weekEnd > monthEnd ? weekEnd : monthEnd
  const items = await readWork(db, "w.status<>'DONE' AND w.start_date<=@end", { end }, false, scope)
  const scheduled = items.filter(item => item.dueDate >= today)
  return Response.json({
    today: scheduled.filter(item => item.startDate <= today),
    overdue: items.filter(item => item.dueDate < today),
    week: scheduled.filter(item => item.startDate <= weekEnd),
    month: scheduled.filter(item => item.startDate <= monthEnd),
  })
}

export async function readWork(db, where, parameters, lock, scope) {
  if (!scope?.team && !scope?.owner) throw new Error('Work scope is required')
  const condition = scope.owner ? 'w.personal_owner_id=@workspaceOwner' : 'w.team_id=@workspaceTeam AND w.personal_owner_id IS NULL'
  const rows = await query(db, `SELECT ${projection} FROM team_work w ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''}
    JOIN team_users u ON u.id=w.assignee_id JOIN team_users creator ON creator.id=w.created_by
    WHERE (${where}) AND ${condition} ORDER BY w.due_date,w.id`,
  scope.owner ? { ...parameters, workspaceOwner: scope.owner } : { ...parameters, workspaceTeam: scope.team })
  const today = seoulToday()
  return rows.map(({ alertJson, ...row }) => ({ ...row, alerts: JSON.parse(alertJson), overdue: row.status !== 'DONE' && row.dueDate < today }))
}

function workId(value) {
  if (!/^\d+$/.test(String(value)) || +value < 1 || +value > 2147483647) invalid()
  return +value
}

// 팀장만 다른 사람에게 배정할 수 있고, 같은 팀 사람에게만 배정합니다. 개인 공간 업무의 담당자는 본인입니다.
async function assignee(db, user, value, fallback, scope) {
  if (value === undefined) return fallback
  const id = workId(value)
  if (id === fallback) return fallback
  if (!canManageTeam(user, scope.team)) throw forbidden()
  const [member] = await query(db, 'SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND (team_id=@team OR managed_team_id=@team) AND is_active=1', { id, team: scope.team })
  if (!member) validate('assigneeId', '팀원을 선택해 주세요.')
  return id
}

// 팀 공간은 그 팀의 유형, 개인 공간은 본인 팀의 유형(관리자는 지원형)을 따릅니다.
async function workKind(db, scope, user) {
  const teamId = scope.team ?? user.teamId
  if (!teamId) return 'SUPPORT'
  const [team] = await query(db, 'SELECT kind FROM teams WHERE id=@teamId', { teamId })
  return team?.kind ?? 'SUPPORT'
}

// 이미 저장된 구분은 팀 유형이 바뀌어도 그대로 둘 수 있고, 새로 고르는 구분은 팀 유형에 맞아야 합니다.
function workValues(input, current, allowed) {
  const startDate = date(input.startDate, 'startDate')
  const dueDate = date(input.dueDate, 'dueDate')
  if (dueDate < startDate) validate('dueDate', '마감일은 시작일보다 빠를 수 없습니다.')
  const time = input.time === undefined ? current?.time ?? null : text(input.time, 'time', 5)
  const endTime = input.endTime === undefined ? current?.endTime ?? null : text(input.endTime, 'endTime', 5)
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) validate('time', '시간을 확인해 주세요.')
  if (endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) validate('endTime', '종료 시각을 확인해 주세요.')
  if (startDate === dueDate && time && endTime && endTime < time) validate('endTime', '종료 시각은 시작 시각보다 빠를 수 없습니다.')
  const alerts = input.alerts === undefined ? current?.alerts ?? [] : input.alerts
  if (!Array.isArray(alerts) || alerts.length > alertOptions.length || alerts.some(value => !alertOptions.includes(value))) {
    validate('alerts', '알림 시점을 확인해 주세요.')
  }
  const repeat = choice(input.repeat ?? current?.repeat ?? '없음', 'repeat', ['없음', '매일', '매주'])
  return {
    title: text(input.title, 'title', 100, true),
    company: text(input.company, 'company', 160),
    notes: text(input.notes, 'notes', 2000),
    startDate, dueDate,
    category: current && input.category === current.category ? current.category : choice(input.category, 'category', allowed),
    status: choice(input.status, 'status', statuses),
    today: seoulToday(),
    time, endTime, alertJson: JSON.stringify([...new Set(alerts)]), repeat: alerts.length ? repeat : '없음',
  }
}

async function create(db, input, user, scope, sourceQuoteId = null) {
  const value = workValues(input, null, categoriesByKind[await workKind(db, scope, user)])
  const assigneeId = await assignee(db, user, input.assigneeId, user.id, scope)
  const [{ id }] = await query(db, `INSERT INTO team_work(title,company,notes,category,start_date,due_date,status,assignee_id,created_by,source_quote_id,completed_date,personal_owner_id,team_id,work_time,end_time,reminder_offsets,reminder_repeat)
    OUTPUT inserted.id VALUES (@title,@company,@notes,@category,@startDate,@dueDate,@status,@assigneeId,@createdBy,@sourceQuoteId,
    CASE WHEN @status='DONE' THEN CONVERT(date,@today) END,@owner,@team,@time,@endTime,@alertJson,@repeat)`,
  { ...value, assigneeId, createdBy: user.id, sourceQuoteId, owner: scope.owner ?? null, team: scope.owner ? null : scope.team })
  return Response.json((await readWork(db, 'w.id=@id', { id }, false, scope))[0], { status: 201 })
}

// 목록 범위(한 가지만): scope=all 전체(업체 관리), scope=summary 이번 달 현황(KPI·오늘·알림·지연·이번 달 완료),
// from·to 기간과 겹치는 업무(캘린더에 보이는 범위), completed=YYYY-MM|all 그 달(또는 전체)에 완료한 업무, month(기본 이번 달).
function rangeCondition(params, bindings) {
  const range = params.get('scope'), keys = ['scope', 'month', 'from', 'to', 'completed'].filter(key => params.has(key))
  if (keys.length > (params.has('from') ? 2 : 1) || (range && !['all', 'summary'].includes(range))) invalid()
  if (range === 'all') return '1=1'
  if (range === 'summary') {
    // 사용자 결정(2026-11-24): 캘린더 화면의 현황 숫자와 목록(오늘·이번 주·기한 초과·완료·알림)은 이번 달 업무만 셉니다.
    // 이번 달과 기간이 겹치는 업무와 이번 달에 완료한 업무만 읽으므로, 지난달 이전에 마감한 미완료 업무나
    // 다음 달에 시작하는 업무(이번 주 예정·미리 알림)는 빠집니다.
    const [start, end] = calendarMonth(new URLSearchParams({ month: seoulToday().slice(0, 7) }))
    Object.assign(bindings, { start, end })
    return '(w.start_date<=@end AND w.due_date>=@start OR w.completed_date BETWEEN @start AND @end)'
  }
  if (params.has('completed')) {
    const month = params.get('completed')
    if (month === 'all') return "w.status='DONE'"
    const [start, end] = calendarMonth(new URLSearchParams({ month }))
    Object.assign(bindings, { start, end })
    return "w.status='DONE' AND w.completed_date BETWEEN @start AND @end"
  }
  if (params.has('from') || params.has('to')) {
    const start = date(params.get('from'), 'from'), end = date(params.get('to'), 'to')
    if (end < start || Date.parse(end) - Date.parse(start) > 62 * 86_400_000) invalid()
    Object.assign(bindings, { start, end })
    // 기간 안에 완료한 업무도 함께 읽어, 캘린더에서 본 달의 완료 건수를 셀 수 있게 합니다.
    return '(w.start_date<=@end AND w.due_date>=@start OR w.completed_date BETWEEN @start AND @end)'
  }
  const [start, end] = calendarMonth(new URLSearchParams({ month: params.get('month') ?? seoulToday().slice(0, 7) }))
  Object.assign(bindings, { start, end })
  return 'w.start_date<=@end AND w.due_date>=@start'
}

async function list(db, params, scope) {
  queryKeys(params, ['month', 'from', 'to', 'completed', 'assignee', 'category', 'status', 'search', 'scope'])
  const bindings = {}
  const conditions = [rangeCondition(params, bindings)]
  if (params.has('assignee')) {
    bindings.assignee = workId(params.get('assignee'))
    conditions.push('w.assignee_id=@assignee')
  }
  if (params.has('category')) {
    bindings.category = choice(params.get('category'), 'category', categories)
    conditions.push('w.category=@category')
  }
  if (params.has('status')) {
    bindings.status = choice(params.get('status'), 'status', statuses)
    conditions.push('w.status=@status')
  }
  const search = text(params.get('search'), 'search', 100)
  if (search) {
    bindings.search = search
    conditions.push('(CHARINDEX(@search,w.title)>0 OR CHARINDEX(@search,w.company)>0)')
  }
  return Response.json(await readWork(db, conditions.join(' AND '), bindings, false, scope))
}

export async function teamWork(db, request, path, params, user, scope) {
  if (!path.length && request.method === 'GET') return list(db, params, scope)
  if (!path.length && request.method === 'POST') {
    const input = await body(request, fields)
    return transaction(db, tx => create(tx, input, user, scope))
  }
  if (![1, 2, 3].includes(path.length)) return
  const id = workId(path[0])
  const read = async (source, lock) => found((await readWork(source, 'w.id=@id', { id }, lock, scope))[0], 'WORK')
  const canEdit = work => canManageTeam(user, scope.team) || work.assigneeId === user.id
  if (path[1] === 'attachments') {
    return workAttachments(db, request, params, id, path[2] ? workId(path[2]) : undefined, user.id, read, canEdit)
  }
  if (path.length === 1 && request.method === 'GET') return Response.json(await read(db))
  if (path.length === 2 && path[1] === 'meetings' && request.method === 'GET') {
    await read(db)
    if (!scope.team) return Response.json([])
    return Response.json(await query(db, `SELECT m.kind,CONVERT(char(10),m.meeting_date,23) AS day
      FROM team_meetings m WHERE m.team_id=@team
        AND EXISTS (SELECT 1 FROM OPENJSON(m.work_ids) w WHERE w.type=2 AND TRY_CONVERT(int,w.value)=@id)
      ORDER BY m.meeting_date DESC,m.kind`, { team: scope.team, id }))
  }
  if (path.length === 2 && path[1] === 'history' && request.method === 'GET') {
    await read(db)
    const rows = await query(db, `SELECT TOP (100) h.id,u.name AS actorName,h.changed_at AS changedAt,h.changes
      FROM team_work_history h JOIN team_users u ON u.id=h.actor_id
      WHERE h.work_id=@id ORDER BY h.id DESC`, { id })
    return Response.json(rows.map(row => ({ ...row, changes: JSON.parse(row.changes) })))
  }
  if (path.length === 2 && path[1] === 'delivery' && request.method === 'POST') {
    const input = await body(request, deliveryFields)
    return transaction(db, async tx => {
      const source = await read(tx, true)
      if (!canEdit(source)) throw forbidden()
      if (source.category !== 'QUOTE' || source.status !== 'DONE') validate('sourceQuoteId', '완료된 견적만 납품으로 이을 수 있습니다.')
      return create(tx, { ...input, company: source.company, notes: source.notes, category: 'DELIVERY', status: 'WAITING' }, user, scope, id)
    })
  }
  if (path.length !== 1 || !['DELETE', 'PUT'].includes(request.method)) return
  const input = request.method === 'PUT' ? await body(request, fields) : null
  return transaction(db, async tx => {
    const current = await read(tx, true)
    if (!canEdit(current)) throw forbidden()
    if (!input) {
      await query(tx, 'UPDATE team_work SET source_quote_id=NULL WHERE source_quote_id=@id; DELETE FROM team_work WHERE id=@id;', { id })
      return new Response(null, { status: 204 })
    }
    const assigneeId = await assignee(tx, user, input.assigneeId, current.assigneeId, scope)
    const value = workValues(input, current, categoriesByKind[await workKind(tx, scope, user)])
    await query(tx, `UPDATE team_work SET title=@title,company=@company,notes=@notes,category=@category,
      start_date=@startDate,due_date=@dueDate,status=@status,assignee_id=@assigneeId,work_time=@time,end_time=@endTime,reminder_offsets=@alertJson,reminder_repeat=@repeat,
      completed_date=CASE WHEN @status='DONE' THEN COALESCE(completed_date,CONVERT(date,@today)) END WHERE id=@id`, { ...value, id, assigneeId })
    const saved = await read(tx)
    const changes = {}
    for (const field of ['startDate', 'dueDate', 'time', 'endTime', 'status', 'assigneeId']) {
      if (current[field] !== saved[field]) {
        const displayField = field === 'assigneeId' ? 'assigneeName' : field
        changes[field] = { before: current[displayField], after: saved[displayField] }
      }
    }
    if (Object.keys(changes).length) {
      await query(tx, 'INSERT INTO team_work_history(work_id,actor_id,changes) VALUES (@id,@actor,@changes)',
        { id, actor: user.id, changes: JSON.stringify(changes) })
    }
    return Response.json(saved)
  })
}
