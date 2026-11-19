import { useRef, useState } from 'react'
import { recordsApi } from '../../api/records'
import { today, dateString } from '../../utils/date'
import './DiaryForm.css'
type Props = { onClose: () => void; onSaved: (date: string) => void; initialDate?: string }
export default function DiaryForm({ onClose, onSaved, initialDate }: Props) {
 const prefix = initialDate ? 'calendar-diary' : 'diary'
 const [title, setTitle] = useState('')
 const [content, setContent] = useState('')
 const [date, setDate] = useState(initialDate ?? today)
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const lock = useRef(false)
 // 브라우저의 기본 폼 제출을 막고, API 저장이 성공하면 기록 날짜를 부모 컴포넌트에 전달합니다.
 async function save(event: React.FormEvent) {
  event.preventDefault()
  if (lock.current || !content.trim() || !date || date > dateString(new Date()) || date < '1000-01-01') return
  lock.current = true; setBusy(true); setError('')
  try { await recordsApi.createDiary(title, content, date); onSaved(date) }
  catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했습니다.') }
  finally { lock.current = false; setBusy(false) }
 }
 return <section className="diary-composer" aria-labelledby={`${prefix}-heading`} aria-busy={busy}>
  <header className="diary-header">
   <div className="diary-intro">
    <span className="diary-mark" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 5.5 18.5 9.5M5 19l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L5 19Z"/><path d="M4 22h16"/></svg></span>
    <div><p className="diary-eyebrow">나를 위한 기록</p><h2 id={`${prefix}-heading`}>일기 쓰기</h2></div>
   </div>
   <button type="button" className="diary-close" aria-label="일기 작성 닫기" disabled={busy} onClick={onClose}>×</button>
  </header>
  <form onSubmit={save}>
   <fieldset disabled={busy}>
    <div className="diary-date-row">
     <label htmlFor={`${prefix}-date`}>기록 날짜</label>
     <input id={`${prefix}-date`} type="date" required min="1000-01-01" max={dateString(new Date())} value={date} onChange={e => setDate(e.target.value)} />
    </div>
    <div className="diary-title-field">
     <label htmlFor={`${prefix}-title`}>제목 (선택)</label>
     <input id={`${prefix}-title`} autoFocus maxLength={100} value={title} placeholder="오늘을 한 문장으로 남긴다면" onChange={e => setTitle(e.target.value)} />
    </div>
    <div className="diary-content-field">
     <label htmlFor={`${prefix}-content`}>일기 본문</label>
     <textarea id={`${prefix}-content`} required maxLength={10000} value={content} placeholder={'어떤 하루를 보냈나요?\n기억하고 싶은 순간과 마음을 자유롭게 적어보세요.'} onChange={e => setContent(e.target.value)} />
     <div className="diary-writing-meta"><span>작은 순간도 소중한 기억이 돼요.</span><span>{content.length.toLocaleString()} / 10,000</span></div>
    </div>
    {error && <p role="alert" className="diary-error">{error}</p>}
    <footer className="diary-footer">
     <p>제목 없이도 괜찮아요.</p>
     <div className="diary-actions"><button type="button" className="diary-cancel" onClick={onClose}>취소</button><button type="submit" className="diary-save" disabled={!content.trim() || !date}>{busy ? '저장 중…' : '일기 저장'}<span aria-hidden="true">↗</span></button></div>
    </footer>
   </fieldset>
  </form>
 </section>
}
