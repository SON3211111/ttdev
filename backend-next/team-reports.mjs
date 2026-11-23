import { query, transaction } from './db.mjs'
import { requireLead } from './team-auth.mjs'
import { readWork } from './team-work.mjs'
import { ApiError, body, date, shiftDay, text, validate } from './validation.mjs'

const fields = ['accomplishments', 'issues', 'nextPlan']
const columns = `r.user_id AS userId,u.name,r.accomplishments,r.issues,r.next_plan AS nextPlan,
  r.snapshot,r.submitted_at AS submittedAt`

function reportView(row) {
  if (!row) return null
  const { snapshot, ...report } = row
  return { ...report, work: snapshot ? JSON.parse(snapshot) : null }
}

async function weekWork(db, week, userId, team) {
  const scope = { team }
  const end = shiftDay(week, 6)
  const next = shiftDay(week, 7)
  const nextEnd = shiftDay(week, 13)
  const completed = await readWork(db, "w.assignee_id=@userId AND w.status='DONE' AND w.completed_date BETWEEN @week AND @end", { userId, week, end }, false, scope)
  const upcoming = await readWork(db, "w.assignee_id=@userId AND w.status<>'DONE' AND w.start_date<=@nextEnd AND w.due_date>=@next", { userId, next, nextEnd }, false, scope)
  const summary = ({ id, title, startDate, dueDate, status }) => ({ id, title, startDate, dueDate, status })
  return { completed: completed.map(summary), upcoming: upcoming.map(summary) }
}

// 보고서는 팀 단위입니다. 다른 팀을 조회(관리자·대표·본부장)할 때는 그 팀의 게시된 팀 보고만 읽습니다.
async function readReports(db, week, user, team) {
  const self = user.id
  const own = team === user.teamId
  const lead = own && user.role === 'LEAD' ? 1 : 0
  const rows = await query(db, `SELECT ${columns},r.kind FROM team_reports r JOIN team_users u ON u.id=r.user_id
    WHERE r.week_start=@week AND r.team_id=@team AND (
      (r.kind='personal' AND (r.user_id=@self OR (@lead=1 AND r.submitted_at IS NOT NULL)))
      OR (r.kind='team' AND (r.submitted_at IS NOT NULL OR @lead=1)))
    ORDER BY u.name,u.id`, { week, self, lead, team })
  const personal = own ? reportView(rows.find(row => row.kind === 'personal' && row.userId === self)) : null
  const teamReport = reportView(rows.find(row => row.kind === 'team'))
  const submissions = lead ? rows.filter(row => row.kind === 'personal' && row.submittedAt).map(reportView) : []
  const work = personal?.work ?? (own ? await weekWork(db, week, self, team) : { completed: [], upcoming: [] })
  return Response.json({ personal, team: teamReport, submissions, ...work })
}

async function saveReport(db, request, week, kind, user, team) {
  if (kind === 'team') requireLead(user)
  const input = await body(request, [...fields, 'submit'])
  if (typeof input.submit !== 'boolean') validate('submit')
  const [accomplishments, issues, nextPlan] = fields.map(field => text(input[field], field, 4000) ?? '')
  if (input.submit && ![accomplishments, issues, nextPlan].some(Boolean)) validate('accomplishments', '보고 내용을 입력해 주세요.')
  const parameters = { week, userId: user.id, kind, team }
  return transaction(db, async tx => {
    const [existing] = await query(tx, `SELECT submitted_at AS submittedAt FROM team_reports WITH (UPDLOCK,HOLDLOCK)
      WHERE week_start=@week AND user_id=@userId AND kind=@kind`, parameters)
    if (existing?.submittedAt) throw new ApiError(409, 'REPORT_SUBMITTED', '제출한 보고는 수정할 수 없습니다.')
    const work = kind === 'personal' ? await weekWork(tx, week, user.id, team) : { completed: [], upcoming: [] }
    const snapshot = input.submit && kind === 'personal' ? JSON.stringify(work) : null
    const values = { ...parameters, accomplishments, issues, nextPlan, snapshot, submit: input.submit ? 1 : 0 }
    if (existing) {
      await query(tx, `UPDATE team_reports SET accomplishments=@accomplishments,issues=@issues,next_plan=@nextPlan,
        snapshot=@snapshot,submitted_at=CASE WHEN @submit=1 THEN SYSUTCDATETIME() END
        WHERE week_start=@week AND user_id=@userId AND kind=@kind`, values)
    } else {
      await query(tx, `INSERT INTO team_reports (week_start,user_id,kind,accomplishments,issues,next_plan,snapshot,submitted_at,team_id)
        VALUES (@week,@userId,@kind,@accomplishments,@issues,@nextPlan,@snapshot,CASE WHEN @submit=1 THEN SYSUTCDATETIME() END,@team)`, values)
    }
    const [row] = await query(tx, `SELECT ${columns} FROM team_reports r JOIN team_users u ON u.id=r.user_id
      WHERE r.week_start=@week AND r.user_id=@userId AND r.kind=@kind`, parameters)
    return Response.json({ report: reportView(row), ...work })
  })
}

export async function teamReports(db, request, [value, kind, ...extra], user, team) {
  if (!value || extra.length) return
  const week = date(value, 'week')
  if (new Date(week).getUTCDay() !== 1) validate('week', '월요일을 선택해 주세요.')
  if (!kind && request.method === 'GET') return readReports(db, week, user, team)
  if (['personal', 'team'].includes(kind) && request.method === 'PUT') return saveReport(db, request, week, kind, user, team)
}
