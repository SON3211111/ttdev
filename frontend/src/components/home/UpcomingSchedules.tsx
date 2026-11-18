// 홈의 다가오는 일정 목록을 담당합니다. 저장과 목록 조회의 성공 여부는 따로 표시합니다.
import { useEffect, useRef, useState } from 'react'
import { schedulesApi } from '../../api/schedules'
import { tasksApi, type CalendarTask, type Dashboard } from '../../api/tasks'
import { day } from '../../utils/date'
import { statusLabels } from '../../types/schedule'
import type { Schedule } from '../../types/schedule'
import useTaskQuery from '../tasks/useTaskQuery'
import ScheduleEditor from './ScheduleEditor'
import './UpcomingSchedules.css'

async function listSchedules(signal: AbortSignal) {
  const items: Schedule[] = []
  for (let page = 0; ; page++) {
    const result = await schedulesApi.list(page, signal)
    items.push(...result.items)
    if (page + 1 >= result.totalPages) return items
  }
}

export default function UpcomingSchedules({ sharedRevision, taskRevision, onChanged, onOpenTask, onOpenTasks }: {
  sharedRevision: number; taskRevision: number; onChanged: () => void
  onOpenTask: (id: string) => void; onOpenTasks: () => void
}) {
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{key: string; data: Schedule[]; error: string} | null>(null)
  const [taskResult, setTaskResult] = useState<{key: string; data: CalendarTask[]; error: string} | null>(null)
  const [editor, setEditor] = useState<{schedule: Schedule | null} | null>(null)
  const [opening, setOpening] = useState(false)
  const [mutating, setMutating] = useState(false)
  const mutationLock = useRef(false)
  // 자식의 저장/삭제 중에는 부모에서도 편집 대상 변경을 막습니다.
  function onBusyChange(value: boolean) { mutationLock.current = value; setMutating(value) }
  const [notice, setNotice] = useState('')
  const [detailError, setDetailError] = useState('')
  const [retryId, setRetryId] = useState<string | null>(null)
  const start = day(0)
  const end = day(6)
  const firstMonth = start.slice(0, 7)
  const lastMonth = end.slice(0, 7)
  const key = JSON.stringify([start, end, revision, sharedRevision])
  const taskKey = JSON.stringify([start, end, revision, taskRevision])
  const current = result?.key === key ? result : null
  const currentTasks = taskResult?.key === taskKey ? taskResult : null
  const summary = useTaskQuery<Dashboard>('/api/tasks/dashboard', revision + taskRevision)
  const entries = [
    ...(current?.data ?? []).map(item => ({ kind: 'schedule' as const, date: item.scheduleDate, item })),
    ...(currentTasks?.data ?? []).map(item => ({ kind: 'task' as const, date: item.dueDate, item })),
  ].sort((left, right) => left.date.localeCompare(right.date))
  const totalPages = Math.ceil(entries.length / 20)
  const shownPage = Math.min(page, Math.max(0, totalPages - 1))
  useEffect(() => {
    const controller = new AbortController()
    listSchedules(controller.signal).then(data => {
      if (controller.signal.aborted) return
      setResult({ key, data, error: '' })
    }).catch(error => { if (!controller.signal.aborted) setResult({key, data: [], error: error instanceof Error ? error.message : '약속을 불러오지 못했습니다.'}) })
    return () => controller.abort()
  }, [key])
  useEffect(() => {
    const controller = new AbortController()
    const months = firstMonth === lastMonth ? [firstMonth] : [firstMonth, lastMonth]
    Promise.all(months.map(month => tasksApi.month(month, controller.signal))).then(months => {
      if (controller.signal.aborted) return
      const data = months.flat().filter(item => item.status !== 'DONE' && item.dueDate >= start && item.dueDate <= end)
      setTaskResult({ key: taskKey, data, error: '' })
    }).catch(() => {
      if (!controller.signal.aborted) setTaskResult({ key: taskKey, data: [], error: '할 일을 불러오지 못했어요.' })
    })
    return () => controller.abort()
  }, [start, end, firstMonth, lastMonth, taskKey])
  async function open(id: string) {
    if (opening || mutationLock.current) return
    setEditor(null) // 다른 상세를 읽는 동안 이전 입력창으로 저장하지 못하게 합니다.
    setOpening(true); setDetailError(''); setRetryId(id)
    try { setEditor({schedule: await schedulesApi.detail(id)}); setRetryId(null) }
    catch (error) { setDetailError(error instanceof Error ? error.message : '일정을 불러오지 못했습니다.') }
    finally { setOpening(false) }
  }
  function changed(message = '') { setNotice(message); setEditor(null); onChanged() }
  return <section id="schedules" className="schedule card" aria-labelledby="schedule-title" aria-busy={!current || !currentTasks}>
    <div className="section-head"><h2 id="schedule-title">앞으로 7일</h2><button className="agenda-manage" disabled={mutating}
      onClick={onOpenTasks}>일정 관리 <span aria-hidden="true">›</span></button></div>
    {Boolean(summary?.data?.overdue) && <p className="agenda-overdue">기한이 지난 할 일 {summary?.data?.overdue}건</p>}
    {notice && <p role="status" className="schedule-notice">{notice}</p>}
    {(!current || !currentTasks) && <p role="status">일정을 불러오는 중입니다…</p>}
    {current?.error && <div role="alert"><p>{current.error}</p><button onClick={() => setRevision(v => v + 1)}>다시 조회</button></div>}
    {currentTasks?.error && <div role="alert"><p>{currentTasks.error}</p><button onClick={() => setRevision(v => v + 1)}>할 일 다시 조회</button></div>}
    {current && currentTasks && !current.error && !currentTasks.error && entries.length === 0 &&
      <p className="description">앞으로 7일간 예정된 약속과 마감할 일이 없어요.</p>}
    {entries.slice(shownPage * 20, (shownPage + 1) * 20).map(entry => <button className="event" key={`${entry.kind}-${entry.item.id}`}
      disabled={opening || mutating} onClick={() => entry.kind === 'task' ? onOpenTask(entry.item.id) : void open(entry.item.id)}>
      <time className="date-tile" dateTime={entry.date}><small>{entry.date.slice(5, 7)}월</small><strong>{entry.date.slice(8)}</strong></time>
      <span className="event-copy"><strong>{entry.item.title}</strong>
        {entry.kind === 'schedule' &&
          <span>약속 · {entry.item.scheduleTime || '시간 미정'} · {entry.item.location || '장소 미정'} · {statusLabels[entry.item.status]}</span>}
      </span>
    </button>)}
    {opening && <p role="status">일정 상세를 불러오는 중입니다…</p>}
    {detailError && <div role="alert">{detailError}{retryId && <button onClick={() => void open(retryId)}>상세 다시 조회</button>}</div>}
    {totalPages > 1 && <nav className="schedule-actions" aria-label="일정 페이지"><button disabled={mutating || shownPage === 0} onClick={() => setPage(shownPage - 1)}>이전</button><span>{shownPage + 1} / {totalPages}</span><button disabled={mutating || shownPage + 1 >= totalPages} onClick={() => setPage(shownPage + 1)}>다음</button></nav>}
    <div className="schedule-actions"><button className="add-event" disabled={opening || mutating} onClick={() => { if (mutationLock.current) return; setEditor({schedule: null}); setDetailError('') }}>＋ 새로운 일정 추가</button><button disabled={!current || mutating} onClick={() => setRevision(v => v + 1)}>새로고침</button></div>
    {editor && <ScheduleEditor key={editor.schedule?.id ?? 'new'} schedule={editor.schedule} onBusyChange={onBusyChange} onClose={() => { if (!mutationLock.current) setEditor(null) }} onSaved={() => changed()} onDeleted={() => changed('일정을 삭제했습니다. 목록을 다시 조회합니다.')} />}
  </section>
}
