// Run as stdin inside the backend container with SQLSERVER_DATABASE=ttech_demo.
import { database, query, transaction } from './db.mjs'
import { hashPassword } from './team-auth.mjs'
import { categoriesByKind } from './team-work.mjs'
import { seoulToday, shiftDay } from './validation.mjs'

if (process.env.SQLSERVER_DATABASE !== 'ttech_demo') throw new Error('Use only the ttech_demo database.')
const db = await database()
const topics = {
  QUOTE: '장비 견적 검토', DELIVERY: '납품 일정 확인', MEETING: '이해관계자 협의', OTHER: '후속 일정 정리',
  DEVELOP: '대시보드 개선', TEST: '기능 검증', FIELD: '현장 지원', PURCHASE: '구매 요청 검토',
  APPROVAL: '결재 서류 검토', HR: '온보딩 준비', ACCOUNTING: '정산 내역 검토',
}
// 팀마다 거래처로 쓰는 실제 기업 4곳입니다(팀 정렬 순서와 같음).
const companiesByTeam = [
  ['삼성전자', '현대자동차', 'LG화학', 'SK하이닉스'],
  ['포스코', '한화에어로스페이스', '두산에너빌리티', 'HD현대중공업'],
  ['LG디스플레이', '삼성SDI', '기아', '롯데케미칼'],
  ['네이버', '카카오', 'LG CNS', '삼성SDS'],
  ['SK텔레콤', 'KT', '포스코DX', '현대오토에버'],
  ['한국전력공사', 'CJ제일제당', '신한은행', '대한항공'],
  ['LG에너지솔루션', '셀트리온', '삼성바이오로직스', '한국항공우주산업'],
]
const today = seoulToday()
const month = today.slice(0, 7) + '-01'
const start = shiftDay(month, -1).slice(0, 7) + '-01'
const next = shiftDay(month, 32).slice(0, 7) + '-01'

try {
  const summary = await transaction(db, async tx => {
    const [lock] = await query(tx, "DECLARE @result int; EXEC @result=sp_getapplock @Resource=N'ttech-demo-seed',@LockMode='Exclusive'; SELECT @result AS result")
    if (lock.result < 0) throw new Error('Cannot acquire seed lock.')
    const [{ total }] = await query(tx, 'SELECT COUNT(*) AS total FROM team_users')
    if (total) return { skipped: true }
    const teams = await query(tx, 'SELECT id,name,kind FROM teams ORDER BY sort_order,id')
    const passwordHash = await hashPassword('Ttech-Demo-2026!')
    async function account(email, name, title, team = null, admin = 0) {
      const [{ id }] = await query(tx, `INSERT INTO team_users(email,name,title,role,team_id,managed_team_id,is_admin,password_hash)
        OUTPUT inserted.id VALUES (@email,@name,@title,@role,@team,@managed,@admin,@passwordHash)`,
      { email: email + '@example.test', name, title, role: title === '팀장' ? 'LEAD' : 'MEMBER',
        team, managed: title === '팀장' ? team : null, admin, passwordHash })
      return id
    }
    const ceo = await account('ceo', '정하늘', '대표', null, 1)
    await account('director', '윤서진', '본부장', null, 1)
    let work = 0, daily = 0, weekly = 0
    for (const [index, team] of teams.entries()) {
      const people = []
      for (const [i, name] of ['김지우', '이민준', '박서연', '최현우'].entries()) {
        people.push(await account(`team${index + 1}.${i ? 'member' + i : 'lead'}`, name + ' (' + team.name + ')', i ? '프로' : '팀장', team.id))
      }
      let periodWork = []
      let dayIndex = 0
      for (let day = start; day < next; day = shiftDay(day, 1)) {
        const weekday = new Date(day).getUTCDay()
        if (!weekday || weekday === 6) continue
        const ids = []
        for (let n = 0; n < 2; n++) {
          const categories = categoriesByKind[team.kind]
          const category = categories[(dayIndex * 2 + n) % categories.length]
          const projects = companiesByTeam[index % companiesByTeam.length]
          const project = projects[(Math.floor(dayIndex / 5) + n + index) % projects.length]
          const due = shiftDay(day, n)
          const status = due > today ? 'WAITING' : dayIndex % 5 === 0 ? 'IN_PROGRESS' : 'DONE'
          const [{ id }] = await query(tx, `INSERT INTO team_work(title,company,category,notes,start_date,due_date,status,assignee_id,created_by,team_id,completed_date,work_time,end_time,reminder_offsets)
            OUTPUT inserted.id VALUES (@title,@project,@category,@notes,@day,@due,@status,@owner,@lead,@team,@completed,'09:30','11:00',@alerts)`,
          { title: `[테스트] ${project} ${topics[category]}`, project, category, day, due, status, completed: status === 'DONE' ? due : null,
            notes: `${team.name} 담당자가 ${project}의 ${topics[category]} 결과를 확인합니다. 변경 사항은 다음 회의에서 공유하고 마감일 ${due}까지 반영합니다.`,
            owner: people[(dayIndex * 2 + n) % people.length], lead: people[0], team: team.id,
            alerts: JSON.stringify(['3일 전', '1일 전', '당일']) })
          ids.push(id)
          work++
        }
        periodWork.push(...ids)
        const dayReport = async (kind, date, linked) => {
          const status = date >= today ? 'DRAFT' : dayIndex % 4 === 0 ? 'PENDING' : 'APPROVED'
          await query(tx, `INSERT INTO team_meetings(meeting_date,kind,author_id,agenda,decisions,followups,work_ids,approval_status,team_id,approved_by,approved_at)
            VALUES (@date,@kind,@actor,@agenda,@decisions,@followups,@linked,@status,@team,@approver,
              CASE WHEN @approver IS NOT NULL THEN CONVERT(datetime2,@date) END)`,
          { date, kind, actor: people[dayIndex % people.length], team: team.id, status, linked: JSON.stringify(linked),
            approver: status === 'APPROVED' ? (dayIndex % 2 ? people[0] : ceo) : null,
            agenda: `[테스트] ${team.name} ${kind === 'weekly' ? '주간' : '일일'}회의 · ${date} 업무 진행과 마감 점검`,
            decisions: dayIndex % 3 ? '진행 중인 업무를 우선 처리하고 검토 결과를 팀에 공유합니다.' : '검토를 마친 항목을 완료 처리하고 다음 일정의 담당자를 확인합니다.',
            followups: '연결된 캘린더 업무의 진행 상태와 지연 사유를 다음 회의에서 확인합니다.' })
        }
        await dayReport('daily', day, ids)
        daily++
        const monday = shiftDay(day, 1 - weekday)
        if ((weekday === 5 || shiftDay(day, 1) === next) && monday >= start) {
          await dayReport('weekly', monday, periodWork)
          weekly++
        }
        if (weekday === 5) periodWork = []
        dayIndex++
      }
    }
    return { start, end: shiftDay(next, -1), accounts: teams.length * 4 + 2, work, daily, weekly }
  })
  console.log(JSON.stringify(summary))
} finally {
  await db.close()
}
