import { query, transaction } from './db.mjs'
import { ApiError, body, date, shiftDay, text, validate } from './validation.mjs'
import { readWork } from './team-work.mjs'

const fields = ['agenda', 'decisions', 'followups']

async function meeting(db, params, lock = false) {
  const [row] = await query(db, `SELECT m.author_id AS authorId,u.name AS author,m.agenda,m.decisions,m.followups,
    m.work_ids AS workJson,m.approval_status AS approvalStatus
    FROM team_meetings m ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} JOIN team_users u ON u.id=m.author_id
    WHERE m.team_id=@team AND m.meeting_date=@day AND m.kind=@kind`, params)
  if (!row) return null
  const { workJson, ...report } = row
  return { ...report, workIds: JSON.parse(workJson) }
}

// 회의 보고서는 팀마다 날짜·종류별로 1건입니다.
export async function teamMeetings(db, request, [kind, value, ...extra], user, team) {
  if (!['daily', 'weekly'].includes(kind) || !value || extra.length > 1 || (extra.length && extra[0] !== 'work')) return
  const day = date(value, 'meetingDate')
  if (kind === 'weekly' && new Date(day).getUTCDay() !== 1) validate('meetingDate', '주간회의는 월요일 기준으로 기록합니다.')
  const params = { kind, day, team }
  const end = kind === 'weekly' ? shiftDay(day, 6) : day
  const available = source => readWork(source, 'w.start_date<=@end AND w.due_date>=@day', { day, end }, false, { team })
  if (extra.length) {
    if (request.method === 'GET') return Response.json(await available(db))
    return
  }
  if (request.method === 'GET') return Response.json(await meeting(db, params))
  if (request.method !== 'PUT') return
  const input = await body(request, [...fields, 'workIds', 'action'])
  if (input.action !== undefined && !['draft', 'submit', 'approve'].includes(input.action)) validate('action')
  return transaction(db, async tx => {
    const current = await meeting(tx, params, true)
    if (current && user.role !== 'LEAD' && user.id !== current.authorId) {
      throw new ApiError(403, 'FORBIDDEN', '작성자와 팀장만 회의 보고서를 수정할 수 있습니다.')
    }
    if (input.action === 'approve') {
      if (user.role !== 'LEAD') throw new ApiError(403, 'FORBIDDEN', '팀장만 결재할 수 있습니다.')
      if (current?.approvalStatus !== 'PENDING') throw new ApiError(409, 'INVALID_APPROVAL', '결재 대기 중인 보고서만 결재할 수 있습니다.')
      await query(tx, "UPDATE team_meetings SET approval_status='APPROVED' WHERE team_id=@team AND meeting_date=@day AND kind=@kind", params)
      return Response.json(await meeting(tx, params))
    }
    if (current && current.approvalStatus !== 'DRAFT') throw new ApiError(409, 'REPORT_LOCKED', '상신된 보고서는 수정할 수 없습니다.')
    const [agenda, decisions, followups] = fields.map(field => text(input[field], field, 4000) ?? '')
    if (![agenda, decisions, followups].some(Boolean)) validate('agenda', '회의 내용을 입력해 주세요.')
    const workIds = input.workIds ?? current?.workIds ?? []
    if (!Array.isArray(workIds) || workIds.length > 100 || workIds.some(id => !Number.isSafeInteger(id) || id < 1)) validate('workIds')
    if (workIds.length) {
      const allowed = new Set((await available(tx)).map(item => item.id))
      if (workIds.some(id => !allowed.has(id))) validate('workIds', '해당 기간에 있는 팀 업무를 선택해 주세요.')
    }
    const workJson = JSON.stringify([...new Set(workIds)])
    const approval = input.action === 'submit' ? 'PENDING' : 'DRAFT'
    const statement = current
      ? 'UPDATE team_meetings SET agenda=@agenda,decisions=@decisions,followups=@followups,work_ids=@workJson,approval_status=@approval WHERE team_id=@team AND meeting_date=@day AND kind=@kind'
      : 'INSERT INTO team_meetings (team_id,meeting_date,kind,author_id,agenda,decisions,followups,work_ids,approval_status) VALUES (@team,@day,@kind,@authorId,@agenda,@decisions,@followups,@workJson,@approval)'
    await query(tx, statement, { ...params, agenda, decisions, followups, authorId: user.id, workJson, approval })
    return Response.json(await meeting(tx, params))
  })
}
