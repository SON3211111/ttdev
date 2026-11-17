import { useRef, useState } from 'react'
import { recordsApi } from '../../api/records'
import { today, dateString } from '../../utils/date'
import './RecordDetail.css'
type Props = { onClose: () => void; onSaved: (date: string) => void }
export default function DiaryForm({ onClose, onSaved }: Props) {
 const [title, setTitle] = useState('')
 const [content, setContent] = useState('')
 const [date, setDate] = useState(today)
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const lock = useRef(false)
 async function save(event: React.FormEvent) {
  event.preventDefault()
  if (lock.current || !content.trim() || !date || date > dateString(new Date()) || date < '1000-01-01') return
  lock.current = true; setBusy(true); setError('')
  try { await recordsApi.createDiary(title, content, date); onSaved(date) }
  catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했습니다.') }
  finally { lock.current = false; setBusy(false) }
 }
 return <section className="record-detail" aria-labelledby="diary-heading" aria-busy={busy}>
 <h2 id="diary-heading">일기 쓰기</h2><form onSubmit={save}>
 <label>기록 날짜<input type="date" required min="1000-01-01" max={dateString(new Date())} value={date} disabled={busy} onChange={e => setDate(e.target.value)} /></label>
 <label>제목 (선택)<input autoFocus maxLength={100} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
 <label>일기 본문<textarea required maxLength={10000} value={content} disabled={busy} onChange={e => setContent(e.target.value)} /></label>
 <p>{content.length.toLocaleString()} / 10,000</p>{error && <p role="alert">{error}</p>}
 <div className="detail-actions"><button disabled={busy || !content.trim()}>{busy ? '저장 중…' : '일기 저장'}</button><button type="button" disabled={busy} onClick={onClose}>취소</button></div>
 </form></section>
}
