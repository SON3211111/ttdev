// 홈 예정 목록과 기간별 일정 관리를 담당합니다. 저장과 목록 조회의 성공 여부는 따로 표시합니다.
import { useEffect, useState } from 'react'
import { schedulesApi } from '../../api/schedules'
import { day } from '../../utils/date'
import { statusLabels } from '../../types/schedule'
import type { Schedule, SchedulePage, ScheduleStatus } from '../../types/schedule'
import ScheduleEditor from './ScheduleEditor'
import './UpcomingSchedules.css'

export default function UpcomingSchedules() {
  const [manage, setManage] = useState(false)
  const [range, setRange] = useState({ start: day(0), end: day(6), status: '' as ScheduleStatus | '' })
  const [draftRange, setDraftRange] = useState(range)
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{key: string; data: SchedulePage | null; error: string} | null>(null)
  const [editor, setEditor] = useState<{schedule: Schedule | null} | null>(null)
  const [opening, setOpening] = useState(false)
  const [notice, setNotice] = useState('')
  const [detailError, setDetailError] = useState('')
  const [retryId, setRetryId] = useState<string | null>(null)
  const start = manage ? range.start : day(0)
  const end = manage ? range.end : day(6)
  const status = manage ? range.status : 'PLANNED'
  const key = JSON.stringify([start, end, status, page, revision])
  const current = result?.key === key ? result : null
  useEffect(() => {
    const controller = new AbortController()
    schedulesApi.list(start, end, status, page, controller.signal).then(data => {
      if (controller.signal.aborted) return
      if (page > 0 && data.items.length === 0) { setPage(value => value - 1); return }
      setResult({ key, data, error: '' })
    }).catch(error => { if (!controller.signal.aborted) setResult({key, data: null, error: error instanceof Error ? error.message : '일정을 불러오지 못했습니다.'}) })
    return () => controller.abort()
  }, [start, end, status, page, revision, key])
  async function open(id: string) {
    if (opening) return
    setOpening(true); setDetailError(''); setRetryId(id)
    try { setEditor({schedule: await schedulesApi.detail(id)}); setRetryId(null) }
    catch (error) { setDetailError(error instanceof Error ? error.message : '일정을 불러오지 못했습니다.') }
    finally { setOpening(false) }
  }
  function changed(message: string) { setNotice(message); setEditor(null); setRevision(v => v + 1) }
  return <section id="schedules" className="schedule card" aria-labelledby="schedule-title" aria-busy={!current}>
    <div className="section-head"><h2 id="schedule-title">{manage ? '일정 관리' : '다가오는 일정'}</h2><button onClick={() => { setManage(!manage); setPage(0) }}>{manage ? '다가오는 일정' : '일정 관리'}</button></div>
    <p className="description">{manage ? '선택한 기간의 일정' : '오늘 포함 7일 · 예정'} · {start} — {end}</p>
    {manage && <form className="schedule-range" onSubmit={event => { event.preventDefault(); setRange(draftRange); setPage(0) }}>
      <label>시작 날짜<input type="date" required min="1000-01-01" max={draftRange.end} value={draftRange.start} onChange={e => setDraftRange({...draftRange, start: e.target.value})} /></label>
      <label>종료 날짜<input type="date" required min={draftRange.start} max="9999-12-31" value={draftRange.end} onChange={e => setDraftRange({...draftRange, end: e.target.value})} /></label>
      <label>조회 상태<select aria-label="조회 상태" value={draftRange.status} onChange={e => setDraftRange({...draftRange, status: e.target.value as ScheduleStatus | ''})}><option value="">전체</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button>조회</button>
    </form>}
    {notice && <p role="status" className="schedule-notice">{notice}</p>}
    {!current && <p role="status">일정을 불러오는 중입니다…</p>}
    {current?.error && <div role="alert"><p>{current.error}</p><button onClick={() => setRevision(v => v + 1)}>다시 조회</button></div>}
    {current?.data?.items.length === 0 && <p className="description">표시할 일정이 없습니다.</p>}
    {current?.data?.items.map(event => <button className="event" key={event.id} disabled={opening} onClick={() => void open(event.id)}>
      <time className="date-tile" dateTime={event.scheduleDate}><small>{event.scheduleDate.slice(5,7)}월</small><strong>{event.scheduleDate.slice(8)}</strong></time>
      <span className="event-copy"><strong>{event.title}</strong><span>{event.scheduleTime || '시간 미정'} · {event.location || '장소 미정'} · {statusLabels[event.status]}</span></span>
    </button>)}
    {opening && <p role="status">일정 상세를 불러오는 중입니다…</p>}
    {detailError && <div role="alert">{detailError}{retryId && <button onClick={() => void open(retryId)}>상세 다시 조회</button>}</div>}
    {current?.data && current.data.totalPages > 1 && <nav className="schedule-actions" aria-label="일정 페이지"><button disabled={page === 0} onClick={() => setPage(page - 1)}>이전</button><span>{page + 1} / {current.data.totalPages}</span><button disabled={page + 1 >= current.data.totalPages} onClick={() => setPage(page + 1)}>다음</button></nav>}
    <div className="schedule-actions"><button className="add-event" disabled={opening} onClick={() => { setEditor({schedule: null}); setDetailError('') }}>＋ 새로운 일정 추가</button><button disabled={!current} onClick={() => setRevision(v => v + 1)}>새로고침</button></div>
    {editor && <ScheduleEditor key={editor.schedule?.id ?? 'new'} schedule={editor.schedule} onClose={() => setEditor(null)} onSaved={value => changed('일정을 저장했습니다. 목록을 다시 조회합니다. (' + value.scheduleDate + ')')} onDeleted={() => changed('일정을 삭제했습니다. 목록을 다시 조회합니다.')} />}
  </section>
}
