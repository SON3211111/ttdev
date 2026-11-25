// Run as stdin inside ttech-demo-backend.
import { database, query, transaction } from './db/db.mjs'
import { readWork } from './team/team-work.mjs'
import { shiftDay } from './lib/validation.mjs'

if (process.env.SQLSERVER_DATABASE !== 'ttech_demo') throw new Error('Use only ttech_demo.')
const db = await database()
try {
  const counts = await transaction(db, async tx => {
    const weeks = await query(tx, `SELECT DISTINCT team_id AS team,CONVERT(char(10),meeting_date,23) AS week
      FROM team_meetings WHERE kind='weekly' AND LEFT(agenda,5)=N'[테스트]' ORDER BY team,week`)
    if (!weeks.length) throw new Error('Demo meetings are missing.')
    const counts = { personal: 0, team: 0 }
    for (const [index, { team, week }] of weeks.entries()) {
      const members = await query(tx, `SELECT id,name,CASE WHEN managed_team_id=@team THEN 1 ELSE 0 END AS lead
        FROM team_users WHERE team_id=@team AND email LIKE 'team%.%@example.test' ORDER BY id`, { team })
      const end = shiftDay(week, 6)
      const next = shiftDay(week, 7)
      const nextEnd = shiftDay(week, 13)
      const bound = { week, end, next, nextEnd }
      const scope = { team }
      const completed = await readWork(tx, "w.status='DONE' AND w.completed_date BETWEEN @week AND @end", bound, false, scope)
      const upcoming = await readWork(tx, "w.status<>'DONE' AND w.start_date<=@nextEnd AND w.due_date>=@next", bound, false, scope)
      const titles = items => items.slice(0, 4).map(item => item.title).join(' / ')
      const summary = ({ id, title, startDate, dueDate, status }) => ({ id, title, startDate, dueDate, status })
      async function insert(userId, kind, submit, done, planned, name) {
        const snapshot = submit && kind === 'personal' ? JSON.stringify({ completed: done.map(summary), upcoming: planned.map(summary) }) : null
        const rows = await query(tx, `INSERT INTO team_reports(week_start,user_id,kind,accomplishments,issues,next_plan,snapshot,submitted_at,team_id)
          OUTPUT inserted.user_id
          SELECT @week,@userId,@kind,@accomplishments,@issues,@plan,@snapshot,
            CASE WHEN @submit=1 THEN CONVERT(datetime2,@day) END,@team
          WHERE NOT EXISTS (SELECT 1 FROM team_reports WITH (UPDLOCK,HOLDLOCK)
            WHERE team_id=@team AND week_start=@week AND user_id=@userId AND kind=@kind)`,
        { week, team, userId, kind, submit: Number(submit), day: shiftDay(week, 4), snapshot,
          accomplishments: `[테스트] ${name} 업무보고. 완료 ${done.length}건. ${titles(done)}`,
          issues: index % 3 ? '진행 중인 업무는 다음 회의에서 담당자와 마감일을 확인합니다.' : '업무 검토 결과 공유가 지연되어 다음 주 초에 일정을 다시 확인합니다.',
          plan: planned.length ? titles(planned) : '다음 주 회의에서 후속 업무와 일정을 확정합니다.' })
        counts[kind] += rows.length
      }
      for (const [i, person] of members.entries()) {
        await insert(person.id, 'personal', i !== 3 || index % 3 === 0,
          completed.filter(item => item.assigneeId === person.id), upcoming.filter(item => item.assigneeId === person.id), person.name)
      }
      const lead = members.find(person => person.lead)
      if (lead) await insert(lead.id, 'team', index % 5 !== 0, completed, upcoming, '팀')
    }
    return counts
  })
  console.log(JSON.stringify(counts))
} finally {
  await db.close()
}
