import { useRef, useState } from 'react'
import { taskError, tasksApi, taskStatuses } from '../api/tasks'
import type { Task, TaskEvent, TaskPage, TaskStatus } from '../api/tasks'
import SiteHeader from '../components/layout/SiteHeader'
import TaskDashboard from '../components/tasks/TaskDashboard'
import TaskEditor from '../components/tasks/TaskEditor'
import useTaskQuery from '../components/tasks/useTaskQuery'
import '../components/tasks/Tasks.css'

const filters = [
  { status: '', name: '전체' },
  { status: 'TODO', name: taskStatuses.TODO },
  { status: 'DOING', name: taskStatuses.DOING },
  { status: 'DONE', name: taskStatuses.DONE },
] as const

function History({ id, revision }: { id: string; revision: number }) {
  const [retry, setRetry] = useState(0)
  const result = useTaskQuery<TaskEvent[]>(`/api/tasks/${id}/history`, revision + retry)
  if (!result) return <p role="status">변경 이력을 불러오는 중입니다…</p>
  if (result.error) return <p role="alert">{result.error} <button onClick={() => setRetry(value => value + 1)}>이력 다시 조회</button></p>
  if (!result.data?.length) return <p>상태 변경 이력이 없어요.</p>
  return <ol className="task-history">{result.data.map((event, index) => <li key={index}>
    <span>{taskStatuses[event.previousStatus]} → {taskStatuses[event.nextStatus]}</span>
    <time dateTime={event.changedAt}>{new Date(event.changedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</time>
  </li>)}</ol>
}

export default function TasksPage({ selectedTask, onHome }: {
  selectedTask: { id: string; source: 'calendar' | 'schedules' } | null
  onHome: (section: string) => void
}) {
  const [filter, setFilter] = useState<TaskStatus | ''>('')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [editor, setEditor] = useState<{ task: Task | null } | null>(null)
  const [history, setHistory] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [focusedId, setFocusedId] = useState(selectedTask?.id ?? null)
  const [expandedId, setExpandedId] = useState(selectedTask?.id ?? null)
  const lock = useRef(false)
  const params = new URLSearchParams({ page: String(page) })
  if (filter) params.set('status', filter)
  const result = useTaskQuery<TaskPage | Task>(focusedId ? `/api/tasks/${focusedId}` : `/api/tasks?${params}`, revision)
  const data = result?.data
  const listing = data && 'items' in data ? data : null
  const items = listing?.items ?? (data && 'id' in data ? [data] : [])
  const refresh = () => setRevision(current => current + 1)

  async function mutate(action: () => Promise<unknown>, message: string, newTask = false) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setEditor(null)
      setPage(0)
      if (newTask) setFilter('TODO')
      setNotice(message)
      refresh()
    } catch (error) {
      setError(taskError(error))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function openEditor(task: Task | null) {
    setError('')
    setEditor({ task })
  }

  function selectStatus(task: Task, next: TaskStatus) {
    if (task.status === next) return
    void mutate(async () => {
      await tasksApi.status(task.id, next)
      if (filter) setFilter(next)
    }, `${taskStatuses[next]} 상태로 바꿨어요.`)
  }

  return <div className="shell">
    <SiteHeader tasksActive busy={busy} onHomeSection={onHome} onNavigate={() => onHome('memory')} />
    <main className="home-main task-workspace">
      <header className="task-header">
        <h1>일정 관리</h1>
        <button className="task-primary" disabled={Boolean(editor) || busy} onClick={() => openEditor(null)}>＋ 할 일 추가</button>
      </header>
      <div className="grid">
        <div className="home-primary">
          {editor && <TaskEditor task={editor.task} busy={busy} error={error}
            onClose={() => { setEditor(null); setError('') }}
            onSave={input => void mutate(() => tasksApi.save(input, editor.task?.id), '일정을 저장했어요.', editor.task === null)} />}
          <section className="task-panel" aria-labelledby="task-list-title">
            <h2 id="task-list-title">{focusedId ? '할 일 상세' : '할 일 목록'}</h2>
            {selectedTask && <div className="task-actions">
              <button disabled={busy} onClick={() => onHome(selectedTask.source)}>
                {selectedTask.source === 'calendar' ? '캘린더로 돌아가기' : '앞으로 7일로 돌아가기'}
              </button>
              {focusedId && <button disabled={busy} onClick={() => { setFocusedId(null); setError('') }}>전체 일정 보기</button>}
            </div>}
            {!focusedId && <div className="task-actions task-filters" aria-label="일정 상태 필터">
              {filters.map(option => <button key={option.status} aria-pressed={filter === option.status} disabled={busy}
                onClick={() => { setFilter(option.status); setPage(0); setHistory(null); setExpandedId(null) }}>{option.name}</button>)}
            </div>}
            {notice && <p role="status">{notice}</p>}
            {!editor && error && <p role="alert">{error} <button onClick={() => { setError(''); refresh() }}>목록 다시 조회</button></p>}
            {!result && <p role="status">일정을 불러오는 중입니다…</p>}
            {result?.error && <p role="alert">{result.error} <button onClick={refresh}>목록 다시 조회</button></p>}
            {data && items.length === 0 && <p>표시할 일정이 없어요.</p>}
            <ul className="task-list">
              {items.map(task => <li key={task.id} className="task-item">
                <div className="task-item-overview">
                  <div className="task-item-copy">
                    <strong>{task.title}</strong>
                    <small><span className="task-item-state">{taskStatuses[task.status]}</span>
                      {task.dueDate ? `마감 ${task.dueDate}` : '마감일 없음'}{task.overdue && <span className="task-danger"> · 기한 지남</span>}
                    </small>
                  </div>
                </div>
                <details className="task-detail" open={expandedId === task.id}>
                  <summary onClick={event => {
                    event.preventDefault()
                    setExpandedId(current => current === task.id ? null : task.id)
                  }}>상세 보기</summary>
                  {task.description && <p className="task-description">{task.description}</p>}
                  {task.completedAt && <small>완료 {new Date(task.completedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</small>}
                  <fieldset className="task-status-controls" disabled={busy || Boolean(editor)} aria-label="진행 상태 변경">
                    {(Object.keys(taskStatuses) as TaskStatus[]).map(status =>
                      <button key={status} type="button" aria-pressed={task.status === status} onClick={() => selectStatus(task, status)}>
                        {taskStatuses[status]}
                      </button>)}
                  </fieldset>
                  <div className="task-actions">
                    <fieldset disabled={busy || Boolean(editor)}>
                      <button onClick={() => openEditor(task)}>수정</button>
                      <button className="task-danger" onClick={() => {
                        if (window.confirm('이 일정과 상태 변경 이력을 삭제할까요?'))
                          void mutate(async () => {
                            await tasksApi.delete(task.id)
                            setFocusedId(null)
                          }, '일정을 삭제했어요.')
                      }}>삭제</button>
                    </fieldset>
                    <button aria-expanded={history === task.id} onClick={() => setHistory(history === task.id ? null : task.id)}>변경 이력</button>
                  </div>
                  {history === task.id && <History key={task.id} id={task.id} revision={revision} />}
                </details>
              </li>)}
            </ul>
            {listing && listing.totalPages > 1 && <nav className="task-actions" aria-label="일정 페이지">
              <button disabled={busy || page === 0} onClick={() => setPage(page - 1)}>이전</button>
              <span>{page + 1} / {listing.totalPages}</span>
              <button disabled={busy || page + 1 >= listing.totalPages} onClick={() => setPage(page + 1)}>다음</button>
            </nav>}
          </section>
        </div>
        <aside className="home-sidebar" aria-label="일정 요약">
          <TaskDashboard revision={revision} onRetry={refresh} />
        </aside>
      </div>
    </main>
  </div>
}
