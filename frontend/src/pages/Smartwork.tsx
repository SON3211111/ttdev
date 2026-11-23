import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CalendarCheck, CalendarDays, CircleAlert, CircleCheck, SlidersHorizontal } from 'lucide-react'
import PortalHome from '../components/PortalHome'
import Sidebar from '../components/Sidebar'
import TopHeader from '../components/TopHeader'
import CalendarView, { type CalendarMode } from '../components/CalendarView'
import TaskDrawer, { type DrawerState } from '../components/TaskDrawer'
import BottomWidgets, { WorkList } from '../components/BottomWidgets'
import { ClientsView } from '../components/SmartworkViews'
import { KindContext } from '../components/kind-context'
import { categoriesByKind, categoryLabel, overdueDays, overlaps, reminderDue, seoulDate, shiftDate, type Task, type View, type Category, type WorkStatus } from '../components/smartwork-data'
import { teamGet, teamWrite, withTeam, type Team, type TeamKind, type TeamUser } from '../api/team'
import './Smartwork.css'

const labels = { today: '오늘의 업무', notifications: '알림', overdue: '지연 업무', completed: '완료 업무' }
const categories = {
  QUOTE: 'estimate', MEETING: 'meeting', DELIVERY: 'delivery', OTHER: 'etc', DEVELOP: 'develop', TEST: 'test', FIELD: 'field',
  PURCHASE: 'purchase', APPROVAL: 'approval', HR: 'hr', ACCOUNTING: 'accounting',
} as const
const statuses = { WAITING: '대기', IN_PROGRESS: '진행 중', DONE: '완료' } as const
type ApiWork = {
  id: number; category: keyof typeof categories; status: keyof typeof statuses; company: string | null
  startDate: string; dueDate: string; notes: string | null; alerts: string[]; repeat: string; time: string | null
  title: string; assigneeId: number; assigneeName: string; completedDate: string | null
  sourceQuoteId: number | null
}
function fromWork(row: ApiWork): Task {
  return { id: String(row.id), category: categories[row.category], status: statuses[row.status], company: row.company ?? '',
    start: row.startDate, end: row.dueDate, notes: row.notes ?? '', alerts: row.alerts, repeat: row.repeat,
    time: row.time ?? undefined, title: row.title, assigneeId: row.assigneeId, assigneeName: row.assigneeName,
    completedDate: row.completedDate ?? undefined, sourceQuoteId: row.sourceQuoteId ?? undefined }
}
const categoryToApi = Object.fromEntries(Object.entries(categories).map(([api, value]) => [value, api])) as Record<Category, string>
const statusToApi: Record<WorkStatus, string> = { 대기: 'WAITING', '진행 중': 'IN_PROGRESS', 완료: 'DONE' }
const refreshInterval = 60_000
const emptyFilters = { from: '', to: '', company: '', category: '', status: '' }

// 관리자(readOnly)는 teams에서 고른 팀(teamId)을 읽기만 합니다. 팀원·팀장은 자기 팀(teamName)을 봅니다.
// teamKind는 업무 구분 선택지와 라벨, 업체 관리 메뉴 표시를 정합니다.
export default function Smartwork({ currentView, navigate, openWorkspace, switchWorkspace, user, members, logout, reports, personal = false,
  teamName, teamId, teamKind = 'SALES', teams, selectTeam, readOnly = false, workspacePanel, settingsPanel }: {
  currentView: View; navigate: (view: View) => void; openWorkspace: () => void; switchWorkspace: () => void; user?: TeamUser | null
  members: { id: number; name: string }[]; logout: () => void; reports: ReactNode; personal?: boolean
  teamName?: string; teamId?: number; teamKind?: TeamKind; teams?: Team[]; selectTeam?: (id: number) => void; readOnly?: boolean
  workspacePanel?: ReactNode; settingsPanel?: ReactNode
}) {
  const [tasks, setTasks] = useState<Task[]>()
  const [search, setSearch] = useState('')
  const [assignee, setAssignee] = useState('')
  const [filters, setFilters] = useState(emptyFilters)
  const [filterOpen, setFilterOpen] = useState(false)
  const [cursor, setCursor] = useState(seoulDate)
  const [mode, setMode] = useState<CalendarMode>('month')
  const [drawer, setDrawer] = useState<DrawerState>()
  const [menu, setMenu] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [pendingTask, setPendingTask] = useState<string>()
  const portal = currentView === 'portal'
  const todayDate = seoulDate()
  const userId = user?.id
  // 팀 공간은 /work, 개인 공간은 본인만 접근하는 /personal/work를 사용합니다.
  const workPath = personal ? 'personal/work' : 'work'
  const viewOnly = readOnly && !personal
  const listPath = withTeam(workPath + '?scope=all', personal ? undefined : teamId)
  const refresh = useRef<() => void>(undefined)
  const sales = teamKind === 'SALES'
  const workViews = currentView === 'calendar' || currentView === 'clients' || currentView in labels

  // 다른 팀원이 바꾼 업무가 보이도록 화면에 돌아올 때와 1분마다 다시 읽습니다.
  // 새 요청은 이전 요청을 취소하므로, 저장 직후 늦게 도착한 이전 목록이 저장 결과를 덮어쓰지 않습니다.
  useEffect(() => {
    if (!userId || (viewOnly && !teamId)) return
    let controller = new AbortController()
    const load = () => {
      controller.abort()
      const current = controller = new AbortController()
      teamGet<ApiWork[]>(listPath, current.signal).then(rows => {
        setTasks(rows.map(fromWork))
        setError('')
      }).catch(error => {
        if (!current.signal.aborted) setError(error.message)
      })
    }
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    refresh.current = load
    load()
    const timer = window.setInterval(onVisible, refreshInterval)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      controller.abort()
      refresh.current = undefined
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [userId, listPath, viewOnly, teamId])

  // 같은 화면 틀 안에서 메뉴(캘린더·워크스페이스·설정 등)를 옮길 때도 최신 업무를 다시 읽습니다.
  useEffect(() => {
    refresh.current?.()
  }, [currentView])

  // 상단 검색어와 상세 검색(기간·업체·구분·상태·담당자)을 함께 적용합니다. 기간은 업무 기간이 겹치는지로 판단합니다.
  const term = search.trim().toLowerCase()
  const company = filters.company.trim().toLowerCase()
  const filtered = (user ? tasks ?? [] : []).filter(task => (!assignee || String(task.assigneeId) === assignee)
    && [task.company, task.title ?? '', task.notes].some(value => value.toLowerCase().includes(term))
    && (!company || task.company.toLowerCase().includes(company))
    && (!filters.category || task.category === filters.category)
    && (!filters.status || task.status === filters.status)
    && (!filters.from || task.end >= filters.from) && (!filters.to || task.start <= filters.to))
  const filterCount = Object.values(filters).filter(Boolean).length + (assignee ? 1 : 0)
  const today = filtered.filter(task => overlaps(task, todayDate)).sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
  const notifications = filtered.filter(task => reminderDue(task, todayDate))
  const overdue = filtered.filter(task => overdueDays(task, todayDate) > 0)
  const completed = filtered.filter(task => task.status === '완료' && task.completedDate?.slice(0, 7) === todayDate.slice(0, 7))
  const weekEnd = shiftDate(todayDate, (7 - new Date(todayDate).getUTCDay()) % 7)
  const week = filtered.filter(task => task.status !== '완료' && overlaps(task, todayDate, weekEnd))
  // KPI는 백엔드 대시보드(/dashboard)와 같은 기준입니다. 오늘·이번 주는 미완료, 기한 초과는 마감일이 지난 미완료 업무입니다.
  const kpis = [
    { name: '오늘의 업무', count: today.filter(task => task.status !== '완료').length, icon: CalendarDays, color: 'blue', onClick: () => navigate('today') },
    { name: '이번 주 예정', count: week.length, icon: CalendarCheck, color: 'green', onClick: () => { setCursor(todayDate); setMode('week') } },
    { name: '기한 초과', count: overdue.length, icon: CircleAlert, color: 'red', onClick: () => navigate('overdue') },
    { name: '완료 (이번 달)', count: completed.length, icon: CircleCheck, color: 'slate', onClick: () => navigate('completed') },
  ]
  const groups = { today, notifications, overdue, completed }
  const open = (task: Task) => setDrawer({ date: task.start, task })
  const canEdit = (task: Task) => !viewOnly && (personal || user?.role === 'LEAD' || user?.id === task.assigneeId)
  const toggle = async (task: Task) => {
    if (pendingTask || !canEdit(task)) return
    setPendingTask(task.id)
    try {
      await writeTask({ ...task, status: task.status === '완료' ? '대기' : '완료' })
      setFeedback((task.company || task.title) + ' 상태를 변경했습니다.')
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : '상태를 변경하지 못했습니다.')
    } finally {
      setPendingTask(undefined)
    }
  }
  const changeView = (view: View) => {
    setDrawer(undefined)
    setMenu(false)
    navigate(view)
  }
  const setFilter = (key: keyof typeof emptyFilters, value: string) => setFilters(current => ({ ...current, [key]: value }))

  async function writeTask(task: Task, source?: Task) {
    const common = { title: task.title || task.company, startDate: task.start, dueDate: task.end, time: task.time || null,
      alerts: task.alerts, repeat: task.repeat, assigneeId: !personal && user?.role === 'LEAD' ? task.assigneeId : undefined }
    const payload = source ? common : { ...common, company: task.company || null, category: categoryToApi[task.category],
      status: statusToApi[task.status], notes: task.notes }
    const saved = fromWork(await teamWrite<ApiWork>(source ? `${workPath}/${source.id}/delivery` : task.id ? workPath + '/' + task.id : workPath,
      task.id ? 'PUT' : 'POST', payload))
    setTasks(previous => {
      const items = previous ?? []
      return items.some(item => item.id === saved.id) ? items.map(item => item.id === saved.id ? saved : item) : [...items, saved]
    })
    refresh.current?.()
  }

  async function save(task: Task) {
    await writeTask(task, drawer?.source)
    setCursor(task.start)
    setSearch('')
    setAssignee('')
    setFilters(emptyFilters)
    setDrawer(undefined)
    setFeedback((task.company || task.title) + ' 업무를 저장했습니다.')
  }

  const spaceName = personal ? '개인 공간' : teamName ?? '팀 공간'
  return <KindContext.Provider value={teamKind}>
    <div className={`sw-system ${portal ? 'sw-system-portal' : 'sw-system-workspace'}${drawer ? ' sw-panel-open' : ''}`}>
      {!portal && <Sidebar personal={personal} teamName={viewOnly ? '조회' : teamName} userName={user?.name} showClients={sales}
        switchWorkspace={() => { setMenu(false); switchWorkspace() }} view={currentView} navigate={changeView}
        alerts={notifications.length} overdue={overdue.length} open={menu} close={() => setMenu(false)} />}
      <div className="sw-shell">
        <TopHeader portal={portal} view={currentView} navigate={changeView} openWorkspace={openWorkspace} search={search} setSearch={setSearch}
          count={notifications.length} onMenu={() => setMenu(value => !value)} user={user} logout={logout} spaceName={spaceName} />
        {portal ? <PortalHome navigate={changeView} openWorkspace={openWorkspace} name={user?.name} taskCount={tasks && user ? today.length : undefined} /> : <main className="sw-workspace-main">
          <span className="sr-only" role="status">{feedback}</span>
          {error && <p className="sw-error" role="alert">{error}</p>}
          {workViews && !tasks && !error && <p role="status">업무를 불러오는 중입니다…</p>}
          {currentView === 'calendar' && <>
            <div className="sw-page-intro">{personal ? <><h1 className="sw-page-title">개인 워크스페이스</h1><span>{user?.name}님만 보는 업무 캘린더 · {todayDate}</span></>
              : <><h1 className="sw-page-title">{sales ? '영업 캘린더' : '업무 캘린더'}</h1><span>{teamName ?? '팀 워크스페이스'} · {todayDate}</span></>}
              {viewOnly && teams && <label className="sw-assignee-filter">조회할 팀 <select aria-label="조회할 팀" value={teamId} onChange={event => {
                setAssignee('')
                setFilters(emptyFilters)
                selectTeam?.(Number(event.target.value))
              }}>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select><b className="sw-readonly">읽기 전용</b></label>}
              {!personal && <label className="sw-assignee-filter">담당자 <select aria-label="담당자" value={assignee} onChange={event => setAssignee(event.target.value)}>
                <option value="">팀 전체</option>{user && <option value={user.id}>내 업무</option>}
                {members.filter(member => member.id !== user?.id).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select></label>}
              <button type="button" className="sw-secondary sw-filter-toggle" aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)}>
                <SlidersHorizontal size={15} />상세 검색{filterCount > 0 && <b>{filterCount}</b>}</button>
            </div>
            {filterOpen && <form className="sw-card sw-search-panel" aria-label="상세 검색" onSubmit={event => event.preventDefault()}>
              <label>기간 시작<input type="date" value={filters.from} onChange={event => setFilter('from', event.target.value)} /></label>
              <label>기간 끝<input type="date" value={filters.to} onChange={event => setFilter('to', event.target.value)} /></label>
              <label>업체<input value={filters.company} placeholder="업체명" onChange={event => setFilter('company', event.target.value)} /></label>
              <label>업무구분<select aria-label="업무구분" value={filters.category} onChange={event => setFilter('category', event.target.value)}>
                <option value="">전체</option>{categoriesByKind[teamKind].map(value => <option key={value} value={value}>{categoryLabel(value, teamKind)}</option>)}
              </select></label>
              <label>상태<select aria-label="상태" value={filters.status} onChange={event => setFilter('status', event.target.value)}>
                <option value="">전체</option>{Object.values(statuses).map(value => <option key={value}>{value}</option>)}
              </select></label>
              <button type="button" className="sw-secondary" onClick={() => { setFilters(emptyFilters); setAssignee('') }}>초기화</button>
              <p className="sw-search-result" role="status">검색 결과 {filtered.length}건</p>
            </form>}
            <div className="sw-kpis">{kpis.map(({ name, count, icon: Icon, color, onClick }) => <button type="button" className="sw-card sw-stat" key={name} onClick={onClick}>
              <span className={`sw-stat-icon sw-stat-${color}`}><Icon size={21} /></span>
              <span><span className="sw-stat-label">{name}</span><strong>{count}<small>건</small></strong><span className="sw-stat-link">자세히 보기 ›</span></span>
            </button>)}</div>
            <CalendarView cursor={cursor} setCursor={setCursor} mode={mode} setMode={setMode} tasks={filtered} open={open} today={todayDate} readOnly={viewOnly} create={date => {
              if (tasks && !viewOnly) setDrawer({ date })
            }} />
            <BottomWidgets today={today} notifications={notifications} overdue={overdue} open={open} toggle={toggle} navigate={changeView} canEdit={canEdit} pendingId={pendingTask} />
          </>}
          {currentView === 'clients' && sales && <ClientsView tasks={(tasks ?? []).filter(task => task.company)} search={search} />}
          {currentView === 'reports' && !personal && reports}
          {currentView === 'workspace' && workspacePanel}
          {currentView === 'settings' && <section className="sw-card sw-module"><h1 className="sw-page-title">{user?.role === 'ADMIN' ? '조직 관리' : '설정'}</h1>
            {settingsPanel}
            <h2>사내 보안 지침</h2><p>고객사 정보와 업무보고는 사내 승인된 계정으로만 열람합니다.</p>
          </section>}
          {currentView in labels && <section className="sw-card sw-module">
            <h1 className="sw-page-title">{labels[currentView as keyof typeof labels]}</h1>
            <WorkList kind={currentView as keyof typeof labels} tasks={groups[currentView as keyof typeof groups]} open={open} toggle={toggle} canEdit={canEdit} pendingId={pendingTask} />
          </section>}
        </main>}
      </div>
      {drawer && <TaskDrawer key={drawer.task?.id ?? (drawer.source ? 'delivery-' + drawer.source.id : drawer.date)} state={drawer} dismiss={() => setDrawer(undefined)} save={save}
        canEdit={!drawer.task || canEdit(drawer.task)} members={!personal && user?.role === 'LEAD' ? members : []}
        openDelivery={source => setDrawer({ source, date: todayDate })}
        openQuote={id => { const quote = tasks?.find(item => item.id === String(id)); if (quote) open(quote) }}
        remove={async id => {
          await teamWrite(workPath + '/' + id, 'DELETE')
          setTasks(items => items?.filter(item => item.id !== id))
          refresh.current?.()
          setDrawer(undefined)
          setFeedback('업무를 삭제했습니다.')
        }} />}
    </div>
  </KindContext.Provider>
}
