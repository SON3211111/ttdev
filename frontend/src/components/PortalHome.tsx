import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, FileCheck2, LayoutGrid, ListChecks, ShieldCheck } from 'lucide-react'
import { teamGet, type TeamUser } from '../api/team'
import { seoulDate, shiftDate, type View } from './smartwork-data'

type Summary = { startDate: string; dueDate: string; status: string }
type Meeting = { approvalStatus: 'DRAFT' | 'PENDING' | 'APPROVED' } | null
type BriefingGroup = { total: number; items: { title: string; route: string; dueDate: string }[] }
type Briefing = { date: string; dueToday: BriefingGroup; overdue: BriefingGroup; tomorrow: BriefingGroup }
const briefingGroups = [['dueToday', '오늘 마감'], ['overdue', '기한 초과'], ['tomorrow', '내일 일정']] as const
const meetingLabel = (meeting?: Meeting) => meeting === undefined ? '확인 중' : !meeting ? '작성 전'
  : meeting.approvalStatus === 'APPROVED' ? '결재 완료' : meeting.approvalStatus === 'PENDING' ? '결재 대기' : '작성 중'

// 포털 첫 화면: 인사말과 바로가기 카드 3개. 카드 전체를 누르면 이동하고, 설명은 로그인한 사람의 실제 데이터로 보여줍니다.
// 캘린더 숫자는 캘린더 화면과 같은 이번 달 기준(scope=summary)이고, 팀이 없는 사람은 개인 캘린더 기준입니다.
export default function PortalHome({ navigate, openWorkspace, user, members, teamCount, sales }: {
  navigate: (view: View) => void; openWorkspace: () => void; user?: TeamUser | null
  members: { id: number; name: string; role?: string }[]; teamCount: number; sales: boolean
}) {
  const [work, setWork] = useState<Summary[]>()
  const [daily, setDaily] = useState<Meeting>()
  const [weekly, setWeekly] = useState<Meeting>()
  const [briefing, setBriefing] = useState<{ scope: string; data: Briefing | null }>()
  const today = seoulDate()
  const monday = shiftDate(today, -((new Date(today).getUTCDay() + 6) % 7))
  const userId = user?.id, teamId = user?.teamId
  const briefingScope = `${userId ?? ''}:${teamId ?? ''}:${today}`

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    teamGet<Summary[]>((teamId ? 'work' : 'personal/work') + '?scope=summary', controller.signal).then(setWork).catch(() => undefined)
    if (teamId) {
      teamGet<Meeting>('meetings/daily/' + today, controller.signal).then(setDaily).catch(() => undefined)
      teamGet<Meeting>('meetings/weekly/' + monday, controller.signal).then(setWeekly).catch(() => undefined)
    }
    return () => controller.abort()
  }, [userId, teamId, today, monday])

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    teamGet<Briefing>('assistant/briefing', controller.signal).then(data => {
      if (!controller.signal.aborted) setBriefing({ scope: briefingScope, data })
    }).catch(() => {
      if (!controller.signal.aborted) setBriefing({ scope: briefingScope, data: null })
    })
    return () => controller.abort()
  }, [userId, briefingScope])

  const todayBriefing = briefing?.scope === briefingScope ? briefing.data : undefined
  const open = (work ?? []).filter(item => item.status !== 'DONE')
  const weekEnd = shiftDate(today, (7 - new Date(today).getUTCDay()) % 7)
  const calendarText = !user ? '로그인하면 오늘 업무와 이번 주 일정을 확인합니다.' : !work ? '업무를 불러오는 중입니다.'
    : `${teamId ? '' : '개인 캘린더 · '}오늘 업무 ${open.filter(item => item.startDate <= today && item.dueDate >= today).length}건 · 이번 주 예정 ${open.filter(item => item.startDate <= weekEnd && item.dueDate >= today).length}건 · 기한 초과 ${open.filter(item => item.dueDate < today).length}건`
  const lead = members.find(member => member.role === 'LEAD')
  const workspaceText = !user ? '로그인하면 소속 팀 공간과 구성원을 확인합니다.'
    : teamId ? `${user.teamName} · 구성원 ${members.length}명${lead ? ' · 팀장 ' + lead.name : ''}` : `전체 ${teamCount}개 팀 현황 조회 · 개인 캘린더`
  const reportText = !user ? '로그인하면 일일·주간 회의와 업무보고를 확인합니다.'
    : teamId ? `오늘 일일회의 ${meetingLabel(daily)} · 이번 주 주간회의 ${meetingLabel(weekly)}` : `${teamCount}개 팀의 회의록과 업무보고를 조회합니다.`
  const cards = [
    { title: sales ? '영업 캘린더 & 일정' : '업무 캘린더 & 일정', text: calendarText, icon: CalendarDays, open: () => navigate('calendar') },
    { title: '팀 워크스페이스', text: workspaceText, icon: LayoutGrid, open: openWorkspace },
    { title: '회의 및 업무보고', text: reportText, icon: FileCheck2, open: () => navigate('reports') },
  ]
  return <main className="sw-portal">
    <section className="sw-hero">
      <div className="sw-hero-decoration" aria-hidden="true"><CalendarDays size={180} strokeWidth={.8} /></div>
      <p className="sw-hero-tag"><ShieldCheck size={15} />(주)티앤테크 통합 스마트워크 스케줄러</p>
      <h1>{user ? `안녕하세요, ${user.name} 님.` : '사내 업무 공간'}<br />오늘도 안전하고 효율적인 하루 되세요.</h1>
    </section>
    {user && <section className="sw-card sw-briefing" aria-labelledby="briefing-title">
      <h2 id="briefing-title"><ListChecks size={21} aria-hidden="true" /> 오늘의 브리핑</h2>
      {todayBriefing === undefined ? <p role="status">브리핑을 불러오는 중입니다.</p> : todayBriefing === null ? <p>브리핑을 불러오지 못했습니다.</p>
        : <div className="sw-briefing-groups">{briefingGroups.map(([key, label]) => <section key={key}>
          <h3>{label} <span>{todayBriefing[key].total}건</span></h3>
          {todayBriefing[key].items.length > 0 && <ul>{todayBriefing[key].items.map(item =>
            <li key={item.route}><a href={'#' + item.route} title={item.title}>{item.title}</a></li>)}</ul>}
        </section>)}</div>}
    </section>}
    <section className="sw-quick" aria-label="업무 바로가기">{cards.map(({ title, text, icon: Icon, open }) =>
      <button type="button" className="sw-card sw-quick-card" key={title} onClick={open}>
        <span className="sw-quick-icon"><Icon size={26} /></span><ArrowRight className="sw-quick-arrow" size={20} aria-hidden="true" />
        <h2>{title}</h2><p>{text}</p>
      </button>
    )}</section>
  </main>
}
