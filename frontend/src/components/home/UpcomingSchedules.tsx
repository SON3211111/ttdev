// 홈의 다가오는 일정 목록을 담당합니다. 저장과 목록 조회의 성공 여부는 따로 표시합니다.
import { useEffect, useRef, useState } from 'react'
import { schedulesApi } from '../../api/schedules'
import { day } from '../../utils/date'
import { statusLabels } from '../../types/schedule'
import type { Schedule, SchedulePage } from '../../types/schedule'
import ScheduleEditor from './ScheduleEditor'
import './UpcomingSchedules.css'

export default function UpcomingSchedules() {
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{key: string; data: SchedulePage | null; error: string} | null>(null)
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
  const key = JSON.stringify([start, end, page, revision])
  const current = result?.key === key ? result : null
  useEffect(() => {
    const controller = new AbortController()
    schedulesApi.list(page, controller.signal).then(data => {
      if (controller.signal.aborted) return
      if (page > 0 && data.items.length === 0) { setPage(value => value - 1); return }
      setResult({ key, data, error: '' })
    }).catch(error => { if (!controller.signal.aborted) setResult({key, data: null, error: error instanceof Error ? error.message : '일정을 불러오지 못했습니다.'}) })
    return () => controller.abort()
  }, [page, revision, key])
  async function open(id: string) {
    if (opening || mutationLock.current) return
    setEditor(null) // 다른 상세를 읽는 동안 이전 입력창으로 저장하지 못하게 합니다.
    setOpening(true); setDetailError(''); setRetryId(id)
    try { setEditor({schedule: await schedulesApi.detail(id)}); setRetryId(null) }
    catch (error) { setDetailError(error instanceof Error ? error.message : '일정을 불러오지 못했습니다.') }
    finally { setOpening(false) }
  }
  function changed(message = '') { setNotice(message); setEditor(null); setRevision(v => v + 1) }
  return <section id="schedules" className="schedule card" aria-labelledby="schedule-title" aria-busy={!current}>
    <div className="section-head"><h2 id="schedule-title">다가오는 일정</h2></div>
    <p className="description">오늘 포함 7일 · 예정 · {start} — {end}</p>
    {notice && <p role="status" className="schedule-notice">{notice}</p>}
    {!current && <p role="status">일정을 불러오는 중입니다…</p>}
    {current?.error && <div role="alert"><p>{current.error}</p><button onClick={() => setRevision(v => v + 1)}>다시 조회</button></div>}
    {current?.data?.items.length === 0 && <p className="description">표시할 일정이 없습니다.</p>}
    {current?.data?.items.map(event => <button className="event" key={event.id} disabled={opening || mutating} onClick={() => void open(event.id)}>
      <time className="date-tile" dateTime={event.scheduleDate}><small>{event.scheduleDate.slice(5,7)}월</small><strong>{event.scheduleDate.slice(8)}</strong></time>
      <span className="event-copy"><strong>{event.title}</strong><span>{event.scheduleTime || '시간 미정'} · {event.location || '장소 미정'} · {statusLabels[event.status]}</span></span>
    </button>)}
    {opening && <p role="status">일정 상세를 불러오는 중입니다…</p>}
    {detailError && <div role="alert">{detailError}{retryId && <button onClick={() => void open(retryId)}>상세 다시 조회</button>}</div>}
    {current?.data && current.data.totalPages > 1 && <nav className="schedule-actions" aria-label="일정 페이지"><button disabled={mutating || page === 0} onClick={() => setPage(page - 1)}>이전</button><span>{page + 1} / {current.data.totalPages}</span><button disabled={mutating || page + 1 >= current.data.totalPages} onClick={() => setPage(page + 1)}>다음</button></nav>}
    <div className="schedule-actions"><button className="add-event" disabled={opening || mutating} onClick={() => { if (mutationLock.current) return; setEditor({schedule: null}); setDetailError('') }}>＋ 새로운 일정 추가</button><button disabled={!current || mutating} onClick={() => setRevision(v => v + 1)}>새로고침</button></div>
    {editor && <ScheduleEditor key={editor.schedule?.id ?? 'new'} schedule={editor.schedule} onBusyChange={onBusyChange} onClose={() => { if (!mutationLock.current) setEditor(null) }} onSaved={() => changed()} onDeleted={() => changed('일정을 삭제했습니다. 목록을 다시 조회합니다.')} />}
  </section>
}
