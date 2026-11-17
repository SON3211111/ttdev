// 입력 초안은 원본과 분리합니다. 실패하면 초안을 유지하고 성공 시에만 부모를 갱신합니다.
import { useRef, useState } from 'react'
import { schedulesApi } from '../../api/schedules'
import { today } from '../../utils/date'
import { statusLabels } from '../../types/schedule'
import type { Schedule, ScheduleStatus } from '../../types/schedule'
type Props = { schedule: Schedule | null; onClose: () => void; onSaved: (schedule: Schedule) => void; onDeleted: () => void }
export default function ScheduleEditor({ schedule, onClose, onSaved, onDeleted }: Props) {
  const [title, setTitle] = useState(schedule?.title ?? '')
  const [date, setDate] = useState(schedule?.scheduleDate ?? today)
  const [time, setTime] = useState(schedule?.scheduleTime ?? '')
  const [location, setLocation] = useState(schedule?.location ?? '')
  const [description, setDescription] = useState(schedule?.description ?? '')
  const [status, setStatus] = useState<ScheduleStatus>(schedule?.status ?? 'PLANNED')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (lock.current || !title.trim() || !date) return
    lock.current = true; setBusy(true); setError('')
    const input = { title, scheduleDate: date, scheduleTime: time || null, location: location || null, description: description || null }
    try { onSaved(schedule ? await schedulesApi.update(schedule.id, { ...input, status }) : await schedulesApi.create(input)) }
    catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했습니다.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function remove() {
    if (!schedule || lock.current || !window.confirm('이 일정을 영구 삭제할까요? 삭제한 일정은 복구할 수 없습니다.')) return
    lock.current = true; setBusy(true); setError('')
    try { await schedulesApi.delete(schedule.id); onDeleted() }
    catch (error) { setError(error instanceof Error ? error.message : '삭제하지 못했습니다.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="schedule-editor" aria-labelledby="schedule-editor-title" aria-busy={busy}>
    <h3 id="schedule-editor-title">{schedule ? '일정 상세·수정' : '새 일정'}</h3>
    <form onSubmit={save}>
      <fieldset disabled={busy}>
        <label>일정명<input autoFocus required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>일정 날짜<input type="date" required min="1000-01-01" max="9999-12-31" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>시간 (선택)<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
        <label>장소 (선택)<input maxLength={200} value={location} onChange={e => setLocation(e.target.value)} /></label>
        <label>메모 (선택)<textarea maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label>
        {schedule && <label>일정 상태<select aria-label="일정 상태" value={status} onChange={e => setStatus(e.target.value as ScheduleStatus)}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
        {error && <p role="alert">{error}</p>}
        <div className="schedule-actions"><button type="submit" disabled={!title.trim()}>{busy ? '처리 중…' : '일정 저장'}</button><button type="button" onClick={onClose}>닫기</button>{schedule && <button type="button" className="danger" onClick={remove}>영구 삭제</button>}</div>
      </fieldset>
    </form>
  </section>
}
