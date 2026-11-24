import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CalendarCheck, CalendarDays, CircleAlert, CircleCheck, SlidersHorizontal } from 'lucide-react'
import PortalHome from '../components/PortalHome'
import Sidebar from '../components/Sidebar'
import TopHeader from '../components/TopHeader'
import CalendarView, { type CalendarMode } from '../components/CalendarView'
import TaskDrawer, { type DrawerState, type SaveTarget } from '../components/TaskDrawer'
import WorkAttachments from '../components/WorkAttachments'
import LinkedMeetings from '../components/LinkedMeetings'
import BottomWidgets, { CompletedView, WorkList } from '../components/BottomWidgets'
import { ClientsView } from '../components/SmartworkViews'
import { KindContext } from '../components/kind-context'
import { calendarGrid, calendarStep, categoriesByKind, categoryLabel, overdueDays, overlaps, reminderDue, seoulDate, shiftDate, type Task, type View, type Category, type WorkStatus, type WorkDetailLocation } from '../components/smartwork-data'
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
  endTime: string | null; createdAt: string | null; createdByName: string
  sourceQuoteId: number | null
}
function fromWork(row: ApiWork): Task {
  return { id: String(row.id), category: categories[row.category], status: statuses[row.status], company: row.company ?? '',
    start: row.startDate, end: row.dueDate, notes: row.notes ?? '', alerts: row.alerts, repeat: row.repeat,
    time: row.time ?? undefined, title: row.title, assigneeId: row.assigneeId, assigneeName: row.assigneeName,
    endTime: row.endTime ?? undefined, createdAt: row.createdAt ?? undefined, createdByName: row.createdByName,
    completedDate: row.completedDate ?? undefined, sourceQuoteId: row.sourceQuoteId ?? undefined }
}
const categoryToApi = Object.fromEntries(Object.entries(categories).map(([api, value]) => [value, api])) as Record<Category, string>
const statusToApi: Record<WorkStatus, string> = { 대기: 'WAITING', '진행 중': 'IN_PROGRESS', 완료: 'DONE' }
const refreshInterval = 60_000
// 팀/개인 캘린더를 바꾸면 화면을 새로 그리므로, 마지막으로 읽은 목록을 경로별로 남겨 두고 새로 읽는 동안 먼저 보여줍니다.
// 한쪽을 읽을 때 반대쪽(내 팀 ↔ 개인)의 같은 화면도 미리 읽어 둡니다. 경로가 사용자마다 같으므로 사용자 ID를 앞에 붙여 보관합니다.
const listCache = new Map<string, Task[]>()
const emptyFilters = { from: '', to: '', company: '', category: '', status: '' }

// 기본은 내 팀(teamName)입니다. 관리자·대표·본부장이 다른 팀을 고르면 teamId(?team=)로 그 팀을 읽기 전용(readOnly)으로 봅니다.
// teams·ownTeamId·selectTeam은 사이드바의 팀 공간 전환에 씁니다. teamKind는 업무 구분 선택지와 라벨, 업체 관리 메뉴 표시를 정합니다.
export default function Smartwork({ currentView, navigate, openWorkspace, switchWorkspace, user, members, logout, reports, personal = false,
  teamName, teamId, teamKind = 'SALES', teams, ownTeamId, selectTeam, readOnly = false, workspacePanel, settingsPanel, detailWorkId, openDetail }: {
  currentView: View; navigate: (view: View) => void; openWorkspace: () => void; switchWorkspace: () => void; user?: TeamUser | null
  members: { id: number; name: string }[]; logout: () => void; reports: ReactNode; personal?: boolean
  teamName?: string; teamId?: number; teamKind?: TeamKind; teams?: Team[]; ownTeamId?: number; selectTeam?: (id: number) => void; readOnly?: boolean
  workspacePanel?: ReactNode; settingsPanel?: ReactNode
  detailWorkId?: string; openDetail: (view: WorkDetailLocation) => void
}) {
  const [tasks, setTasks] = useState<Task[]>()
  // 화면별 목록을 경로(기간)마다 보관합니다. 지금 기간과 앞뒤 기간을 미리 읽어 두어, 달을 옮기면 기다리지 않고 바로 바뀝니다.
  const [viewCache, setViewCache] = useState<Record<string, Task[]>>({})
  const [search, setSearch] = useState('')
  const [assignee, setAssignee] = useState('')
  const [filters, setFilters] = useState(emptyFilters)
  const [filterOpen, setFilterOpen] = useState(false)
  const [cursor, setCursor] = useState(seoulDate)
  const [mode, setMode] = useState<CalendarMode>('month')
  const [drawer, setDrawer] = useState<DrawerState>()
  const [detailTask, setDetailTask] = useState<Task>()
  const [detailVersion, setDetailVersion] = useState(0)
  const [menu, setMenu] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [pendingTask, setPendingTask] = useState<string>()
  const portal = currentView === 'portal'
  const todayDate = seoulDate()
  const userId = user?.id
  const workspaceTeam = teamId ?? user?.teamId
  // 팀 공간은 /work, 개인 공간은 본인만 접근하는 /personal/work를 사용합니다.
  const workPath = personal ? 'personal/work' : 'work'
  const viewOnly = readOnly && !personal
  const [doneMonth, setDoneMonth] = useState(() => seoulDate().slice(0, 7))
  const [doneView, setDoneView] = useState(currentView)
  // 완료 업무 페이지를 떠나면 이번 달로 돌아갑니다(캘린더의 완료 카드는 본 달을 골라 들어감).
  if (doneView !== currentView) {
    setDoneView(currentView)
    if (doneView === 'completed') setDoneMonth(todayDate.slice(0, 7))
  }
  const grid = calendarGrid(cursor, mode)
  // 현황(KPI·오늘·알림·지연·이번 달 완료·사이드바 숫자)은 이번 달 기준으로만 읽습니다(scope=summary).
  // 캘린더는 화면에 보이는 기간만, 완료 업무는 고른 달만, 업체 관리는 전체 업무를 따로 읽습니다.
  const listPath = withTeam(workPath + '?scope=summary', personal ? undefined : teamId)
  const viewQuery = currentView === 'calendar' ? `from=${grid.firstKey}&to=${grid.lastKey}`
    : currentView === 'completed' ? 'completed=' + (doneMonth || 'all') : currentView === 'clients' ? 'scope=all' : ''
  const pathOf = (query: string) => withTeam(workPath + '?' + query, personal ? undefined : teamId)
  const viewPath = viewQuery && pathOf(viewQuery)
  const monthStep = (value: string, direction: number) => new Date(Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1 + direction, 1)).toISOString().slice(0, 7)
  const neighborPaths = currentView === 'calendar' ? [-1, 1].map(direction => {
    const near = calendarGrid(calendarStep(cursor, mode, direction), mode)
    return pathOf(`from=${near.firstKey}&to=${near.lastKey}`)
  }) : currentView === 'completed' && doneMonth ? [-1, 1].map(direction => pathOf('completed=' + monthStep(doneMonth, direction))) : []
  const prefetchKey = neighborPaths.join('|')
  const viewTasks = viewPath ? viewCache[viewPath] ?? listCache.get(userId + ':' + viewPath) : undefined
  const shownTasks = tasks ?? listCache.get(userId + ':' + listPath)
  // 반대쪽 캘린더: 개인이면 내 팀, 내 팀이면 개인(다른 팀을 조회 중이면 미리 읽지 않음).
  const otherBase = personal ? (user?.teamId ? 'work' : '') : teamId ? '' : 'personal/work'
  const otherPaths = otherBase ? [otherBase + '?scope=summary', ...(viewQuery ? [otherBase + '?' + viewQuery] : [])].join('|') : ''
  const refresh = useRef<() => void>(undefined)
  const sales = teamKind === 'SALES'
  const workViews = currentView === 'calendar' || currentView === 'clients' || currentView in labels

  // 다른 팀원이 바꾼 업무가 보이도록 화면에 돌아올 때와 1분마다 다시 읽습니다.
  // 새 요청은 이전 요청을 취소하므로, 저장 직후 늦게 도착한 이전 목록이 저장 결과를 덮어쓰지 않습니다.
  useEffect(() => {
    if (!userId || detailWorkId || (!personal && !workspaceTeam)) return
    let controller = new AbortController()
    const load = () => {
      controller.abort()
      const current = controller = new AbortController()
      const paths = viewPath ? [viewPath, ...prefetchKey.split('|').filter(Boolean)] : []
      Promise.all([teamGet<ApiWork[]>(listPath, current.signal), ...paths.map(path => teamGet<ApiWork[]>(path, current.signal))]).then(([rows, ...lists]) => {
        setTasks(rows.map(fromWork))
        listCache.set(userId + ':' + listPath, rows.map(fromWork))
        // 이번에 읽은 기간만 남겨, 오래된 기간 목록이 다시 보이지 않게 합니다.
        setViewCache(Object.fromEntries(paths.map((path, index) => [path, lists[index].map(fromWork)])))
        paths.forEach((path, index) => listCache.set(userId + ':' + path, lists[index].map(fromWork)))
        setError('')
        for (const path of otherPaths.split('|').filter(Boolean)) {
          teamGet<ApiWork[]>(path, current.signal).then(rows => listCache.set(userId + ':' + path, rows.map(fromWork))).catch(() => undefined)
        }
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
  }, [userId, listPath, viewPath, prefetchKey, otherPaths, viewOnly, teamId, detailWorkId, personal, workspaceTeam])

  useEffect(() => {
    if (!detailWorkId) return
    const controller = new AbortController()
    teamGet<ApiWork>(withTeam(workPath + '/' + detailWorkId, teamId), controller.signal)
      .then(row => setDetailTask(fromWork(row))).catch(error => {
        if (!controller.signal.aborted) setError(error.message)
      })
    return () => controller.abort()
  }, [detailWorkId, workPath, teamId])

  // 같은 화면 틀 안에서 메뉴(캘린더·워크스페이스·설정 등)를 옮길 때도 최신 업무를 다시 읽습니다.
  useEffect(() => {
    refresh.current?.()
  }, [currentView])

  // 상단 검색어와 상세 검색(기간·업체·구분·상태·담당자)을 함께 적용합니다. 기간은 업무 기간이 겹치는지로 판단합니다.
  const term = search.trim().toLowerCase()
  const company = filters.company.trim().toLowerCase()
  const matches = (task: Task) => (!assignee || String(task.assigneeId) === assignee)
    && [task.company, task.title ?? '', task.notes].some(value => value.toLowerCase().includes(term))
    && (!company || task.company.toLowerCase().includes(company))
    && (!filters.category || task.category === filters.category)
    && (!filters.status || task.status === filters.status)
    && (!filters.from || task.end >= filters.from) && (!filters.to || task.start <= filters.to)
  const filtered = (user ? shownTasks ?? [] : []).filter(matches)
  const viewFiltered = (user ? viewTasks ?? [] : []).filter(matches)
  const filterCount = Object.values(filters).filter(Boolean).length + (assignee ? 1 : 0)
  const today = filtered.filter(task => overlaps(task, todayDate)).sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
  const notifications = filtered.filter(task => reminderDue(task, todayDate))
  const overdue = filtered.filter(task => overdueDays(task, todayDate) > 0)
  const completed = filtered.filter(task => task.status === '완료' && task.completedDate?.slice(0, 7) === todayDate.slice(0, 7))
  const weekEnd = shiftDate(todayDate, (7 - new Date(todayDate).getUTCDay()) % 7)
  // 사이드바 숫자와 오늘의 업무·알림·지연 업무 페이지는 이번 달 업무(scope=summary)만 셉니다.
  // 캘린더 화면의 KPI·하단 목록은 캘린더에 보이는 달의 업무만 셉니다(달을 옮기면 숫자도 바뀜).
  // 이번 달이면 오늘·이번 주 기준, 다른 달이면 선택한 날짜(달을 옮기면 1일)와 그 주 기준입니다. 기한 초과·알림은 오늘 기준입니다.
  const shownMonth = cursor.slice(0, 7)
  const [shownYear, shownNumber] = shownMonth.split('-').map(Number)
  const monthStart = shownMonth + '-01', monthEnd = new Date(Date.UTC(shownYear, shownNumber, 0)).toISOString().slice(0, 10)
  const currentMonth = shownMonth === todayDate.slice(0, 7)
  const inMonth = (task: Task) => overlaps(task, monthStart, monthEnd) || (!!task.completedDate && task.completedDate >= monthStart && task.completedDate <= monthEnd)
  const monthTasks = viewFiltered.filter(inMonth)
  const focusDay = currentMonth ? todayDate : cursor
  const focusWeek = currentMonth ? [todayDate, weekEnd] : [shiftDate(cursor, -new Date(cursor).getUTCDay()), shiftDate(cursor, 6 - new Date(cursor).getUTCDay())]
  const [, focusMonth, focusDate] = focusDay.split('-').map(Number)
  const dayTitle = currentMonth ? '오늘의 업무' : `${focusMonth}/${focusDate} 업무`
  const monthToday = monthTasks.filter(task => overlaps(task, focusDay)).sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
  const monthOverdue = monthTasks.filter(task => overdueDays(task, todayDate) > 0)
  const kpis = [
    { name: dayTitle, count: monthToday.filter(task => task.status !== '완료').length, icon: CalendarDays, color: 'blue', onClick: () => currentMonth ? navigate('today') : setMode('day') },
    { name: currentMonth ? '이번 주 예정' : '선택 주 예정', count: monthTasks.filter(task => task.status !== '완료' && overlaps(task, focusWeek[0], focusWeek[1])).length,
      icon: CalendarCheck, color: 'green', onClick: () => { setCursor(focusDay); setMode('week') } },
    { name: '기한 초과', count: monthOverdue.length, icon: CircleAlert, color: 'red', onClick: () => navigate('overdue') },
    { name: `완료 (${shownNumber}월)`, count: monthTasks.filter(task => task.status === '완료' && task.completedDate?.startsWith(shownMonth)).length,
      icon: CircleCheck, color: 'slate', onClick: () => { navigate('completed'); setDoneMonth(shownMonth) } },
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

  // target을 주면 새 업무를 그 캘린더(팀은 내 팀, 개인은 본인)에 저장합니다. 지금 보는 캘린더와 다르면 목록에는 넣지 않습니다.
  async function writeTask(task: Task, source?: Task, target?: SaveTarget) {
    const toPersonal = target ? target === 'personal' : personal
    const here = toPersonal === personal
    const path = here ? workPath : toPersonal ? 'personal/work' : 'work'
    const common = { title: task.title || task.company, startDate: task.start, dueDate: task.end, time: task.time || null,
      endTime: task.endTime || null,
      alerts: task.alerts, repeat: task.repeat, assigneeId: !toPersonal && user?.role === 'LEAD' ? task.assigneeId : undefined }
    const payload = source ? common : { ...common, company: task.company || null, category: categoryToApi[task.category],
      status: statusToApi[task.status], notes: task.notes }
    const saved = fromWork(await teamWrite<ApiWork>(source ? `${workPath}/${source.id}/delivery` : task.id ? workPath + '/' + task.id : path,
      task.id ? 'PUT' : 'POST', payload))
    if (!here) return saved
    const merge = (previous?: Task[]) => {
      const items = previous ?? []
      return items.some(item => item.id === saved.id) ? items.map(item => item.id === saved.id ? saved : item) : [...items, saved]
    }
    // 화면에 바로 반영한 뒤 refresh로 각 목록의 범위에 맞게 다시 읽습니다.
    setTasks(merge)
    if (viewPath) setViewCache(cache => ({ ...cache, [viewPath]: merge(cache[viewPath]) }))
    refresh.current?.()
    return saved
  }

  async function save(task: Task, target?: SaveTarget) {
    const saved = await writeTask(task, drawer?.source, task.id ? undefined : target)
    if (target && !task.id && (target === 'personal') !== personal) {
      const where = target === 'personal' ? '개인' : '팀'
      setDrawer(undefined)
      setFeedback(`${task.company || task.title} 업무를 ${where} 캘린더에 저장했습니다. 캘린더 위 '${where}' 버튼으로 볼 수 있습니다.`)
      return
    }
    if (detailWorkId) {
      setDetailTask(saved)
      setDetailVersion(value => value + 1)
      setFeedback('업무를 저장했습니다.')
      return
    }
    setCursor(task.start)
    setSearch('')
    setAssignee('')
    setFilters(emptyFilters)
    setDrawer(undefined)
    setFeedback((task.company || task.title) + ' 업무를 저장했습니다.')
  }

  // 새 업무는 팀 캘린더(내 팀이 있을 때)와 개인 캘린더 중 골라 저장합니다. 다른 팀을 조회 중일 때는 등록할 수 없습니다.
  const ownTeam = !!user?.teamId
  const saveTargets: { value: SaveTarget; label: string }[] | undefined = ownTeam && !viewOnly
    ? [{ value: 'team', label: '팀 (' + (user?.teamName ?? '내 팀') + ')' }, { value: 'personal', label: '개인' }] : undefined
  const spaceName = personal ? '개인 캘린더' : (teamName ?? '팀 공간') + (viewOnly ? ' (조회)' : '')
  function renderTask(state: DrawerState, inline = false) {
    const task = state.task
    return <TaskDrawer key={(task?.id ?? (state.source ? 'delivery-' + state.source.id : state.date)) + ':' + detailVersion}
      state={state} inline={inline} dismiss={() => inline ? navigate('calendar') : setDrawer(undefined)} save={save} targets={saveTargets} initialTarget={personal ? 'personal' : 'team'}
      historyPath={task && withTeam(workPath + '/' + task.id + '/history', personal ? undefined : teamId)}
      canEdit={!task || canEdit(task)} members={!viewOnly && user?.role === 'LEAD' && (!personal || (!state.task && !state.source)) ? members : []}
      openFull={task && !inline ? () => openDetail(`${personal ? 'personal-work' : 'work'}/${task.id}${!personal && teamId ? '?team=' + teamId : ''}`) : undefined}
      openDelivery={inline ? undefined : source => setDrawer({ source, date: todayDate })}
      openQuote={inline ? id => openDetail(`${personal ? 'personal-work' : 'work'}/${id}${!personal && teamId ? '?team=' + teamId : ''}`)
        : id => { const quote = [...shownTasks ?? [], ...viewTasks ?? []].find(item => item.id === String(id)); if (quote) open(quote) }}
      remove={async id => {
        await teamWrite(workPath + '/' + id, 'DELETE')
        if (inline) { navigate('calendar'); return }
        setTasks(items => items?.filter(item => item.id !== id))
        setViewCache(cache => Object.fromEntries(Object.entries(cache).map(([path, items]) => [path, items.filter(item => item.id !== id)])))
        refresh.current?.()
        setDrawer(undefined)
        setFeedback('업무를 삭제했습니다.')
      }} />
  }
  return <KindContext.Provider value={teamKind}>
    <div className={`sw-system ${portal ? 'sw-system-portal' : 'sw-system-workspace'}${drawer ? ' sw-panel-open' : ''}`}>
      {!portal && <Sidebar personal={personal} teamName={teamName} userName={user?.name} showClients={sales}
        teams={teams} currentTeamId={personal ? ownTeamId : teamId ?? ownTeamId} ownTeamId={ownTeamId} selectTeam={id => { setMenu(false); selectTeam?.(id) }}
        view={currentView} navigate={changeView}
        alerts={notifications.length} overdue={overdue.length} todayCount={today.length} completedCount={completed.length} open={menu} close={() => setMenu(false)} />}
      <div className="sw-shell">
        <TopHeader portal={portal} view={currentView} navigate={changeView} openWorkspace={openWorkspace} search={search} setSearch={setSearch}
          count={notifications.length} onMenu={() => setMenu(value => !value)} user={user} logout={logout} spaceName={spaceName} />
        {portal ? <PortalHome navigate={changeView} openWorkspace={openWorkspace} name={user?.name} taskCount={shownTasks && user ? today.length : undefined} /> : <main className="sw-workspace-main">
          <span className="sr-only" role="status">{feedback}</span>
          {error && <p className="sw-error" role="alert">{error}</p>}
          {(detailWorkId ? !detailTask : workViews && !shownTasks) && !error && <p role="status" className="sr-only">업무를 불러오는 중입니다…</p>}
          {viewOnly && currentView !== 'workspace' && <p className="sw-readonly-banner"><b>{currentView === 'reports' && user?.isAdmin && ['대표', '본부장'].includes(user.title) ? '조회·결재' : '읽기 전용'}</b>{teamName}을(를) 보고 있습니다.
            {ownTeamId && <button type="button" className="sw-secondary" onClick={() => selectTeam?.(ownTeamId)}>내 팀으로 돌아가기</button>}</p>}
          {detailWorkId && (detailTask ? <>
            {renderTask({ date: detailTask.start, task: detailTask }, true)}
            <WorkAttachments path={workPath + '/' + detailTask.id + '/attachments'} teamId={teamId} canEdit={canEdit(detailTask)} />
            {!personal && <LinkedMeetings workId={detailTask.id} teamId={teamId} />}
          </>
            : <button type="button" className="sw-secondary" onClick={() => navigate('calendar')}>캘린더로 돌아가기</button>)}
          {currentView === 'calendar' && !detailWorkId && <>
            <div className="sw-page-intro">{personal ? <><h1 className="sw-page-title">개인 캘린더</h1><span>{user?.name}님만 보는 업무 캘린더 · {todayDate}</span></>
              : <><h1 className="sw-page-title">{sales ? '영업 캘린더' : '업무 캘린더'}</h1><span>{teamName ?? '팀 워크스페이스'} · {todayDate}</span></>}
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
              <p className="sw-search-result" role="status">캘린더 기간({grid.firstKey} ~ {grid.lastKey}) 검색 결과 {viewFiltered.length}건</p>
            </form>}
            <div className="sw-kpis">{kpis.map(({ name, count, icon: Icon, color, onClick }) => <button type="button" className="sw-card sw-stat" key={name} onClick={onClick}>
              <span className={`sw-stat-icon sw-stat-${color}`}><Icon size={21} /></span>
              <span><span className="sw-stat-label">{name}</span><strong>{count}<small>건</small></strong><span className="sw-stat-link">자세히 보기 ›</span></span>
            </button>)}</div>
            {/* 업무 목록을 불러오는 중에도 새 업무 등록은 바로 열립니다(저장하면 목록에 추가되고 다시 읽음). */}
            <CalendarView space={{ personal, canTeam: ownTeam || !!teams?.length, switchTo: () => switchWorkspace() }} cursor={cursor} setCursor={setCursor} mode={mode} setMode={setMode} tasks={viewFiltered} open={open} today={todayDate} readOnly={viewOnly} create={date => {
              if (!viewOnly) setDrawer({ date })
            }} />
            <BottomWidgets today={monthToday} todayTitle={dayTitle} notifications={monthTasks.filter(task => reminderDue(task, todayDate))} overdue={monthOverdue} open={open} toggle={toggle} navigate={changeView} canEdit={canEdit} pendingId={pendingTask} />
          </>}
          {currentView === 'clients' && sales && <ClientsView tasks={(viewTasks ?? []).filter(task => task.company)} search={search} />}
          {currentView === 'reports' && !personal && reports}
          {currentView === 'workspace' && workspacePanel}
          {currentView === 'settings' && <section className="sw-card sw-module"><h1 className="sw-page-title">{user?.isAdmin ? '조직 관리' : '설정'}</h1>
            {settingsPanel}
            <h2>사내 보안 지침</h2><p>고객사 정보와 업무보고는 사내 승인된 계정으로만 열람합니다.</p>
          </section>}
          {currentView === 'completed' && <section className="sw-card sw-module">
            <CompletedView title={labels.completed} tasks={viewFiltered} today={todayDate} month={doneMonth} setMonth={setDoneMonth} open={open} toggle={toggle} canEdit={canEdit} pendingId={pendingTask} />
          </section>}
          {currentView in labels && currentView !== 'completed' && <section className="sw-card sw-module">
            <h1 className="sw-page-title">{labels[currentView as keyof typeof labels]} <span className="sw-page-count">{groups[currentView as keyof typeof groups].length}건</span></h1>
            <WorkList full kind={currentView as keyof typeof labels} tasks={groups[currentView as keyof typeof groups]} open={open} toggle={toggle} canEdit={canEdit} pendingId={pendingTask} />
          </section>}
        </main>}
      </div>
      {drawer && renderTask(drawer)}
    </div>
  </KindContext.Provider>
}
