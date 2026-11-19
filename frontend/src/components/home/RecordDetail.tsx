/**
 * 선택한 기록을 서버에서 읽고 수정/삭제하는 화면입니다.
 * record는 서버에서 읽은 내용이고, content/date는 사용자가 수정 중인 임시 값입니다.
 * 둘을 따로 보관하므로 '취소'를 눌러도 원래 본문이 바뀌지 않습니다.
 * 여러 탭에서 같은 기록을 수정하면 현재는 마지막에 저장한 내용이 남습니다.
 */
import { useEffect, useRef, useState } from 'react'
import { recordsApi } from '../../api/records'
import type { RecordDetail as Detail } from '../../types/record'
import { dateString } from '../../utils/date'
import './RecordDetail.css'

type Props = { id: string; onClose: () => void; onChanged: (message: string) => void }

export default function RecordDetail({ id, onClose, onChanged }: Props) {
  // editing은 수정 폼 표시 여부, busy는 저장/삭제 진행 여부입니다.
  // revision을 올리면 조회 effect가 다시 실행됩니다. submitting은 연속 클릭을 즉시 막는 잠금입니다.
  const [record, setRecord] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const submitting = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)

  // HomePage가 선택 ID를 key로 주어 기록을 바꿀 때 이 화면을 새로 만듭니다.
  // 재시도할 때도 조회하며, 화면을 닫아 취소된 요청의 결과는 반영하지 않습니다.
  // heading.focus()는 키보드 사용자도 새로 열린 상세의 시작 위치를 알 수 있게 합니다.
  useEffect(() => {
    const controller = new AbortController()
    heading.current?.focus()
    recordsApi.detail(id, controller.signal).then(value => {
      if (!controller.signal.aborted) setRecord(value)
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '기록을 불러오지 못했습니다.')
    })
    return () => controller.abort()
  }, [id, revision])

  // 수정 요청이 성공한 뒤 부모 화면에 알려 목록과 캘린더를 다시 조회하도록 합니다.
  async function save() {
    if (submitting.current || !content.trim() || content.trim().length > 10000 || date < '1000-01-01' || date > dateString(new Date())) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      // 서버 저장이 성공해야 record를 바꾸고 수정 폼을 닫습니다. 실패하면 작성 중인 값이 남습니다.
      // onChanged로 부모에게 알려 최근 기록과 캘린더도 다시 읽게 합니다.
      const updated = await recordsApi.update(id, content, date, record?.recordType === 'DIARY' ? title : undefined)
      setRecord(updated)
      setEditing(false)
      onChanged('기록을 수정했습니다.')
    } catch (error) { setError(error instanceof Error ? error.message : '수정하지 못했습니다.') }
    finally { submitting.current = false; setBusy(false) }
  }

  // window.confirm은 확인/취소 창입니다. 취소하면 API를 부르지 않습니다.
  // 실제 DB에서 지우는 삭제이므로 성공 응답을 받은 뒤에만 상세를 닫습니다. 실패하면 원문을 계속 보여줍니다.
  async function remove() {
    if (submitting.current || !window.confirm('이 기록을 영구 삭제할까요? 삭제한 기록은 복구할 수 없습니다.')) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      await recordsApi.delete(id)
      onChanged('기록을 삭제했습니다.')
      onClose()
    } catch (error) { setError(error instanceof Error ? error.message : '삭제하지 못했습니다.') }
    finally { submitting.current = false; setBusy(false) }
  }

  return (
    <section className="record-detail" aria-labelledby="detail-heading" aria-busy={busy}>
      <div className="detail-heading">
        <h2 id="detail-heading" ref={heading} tabIndex={-1}>기록 상세</h2>
        <button disabled={busy} onClick={onClose}>닫기 ×</button>
      </div>
      {error && <p role="alert" className="detail-error">{error}</p>}
      {!record && !error && <p role="status">원문을 불러오는 중입니다…</p>}
      {!record && error && <button onClick={() => { setError(''); setRevision(value => value + 1) }}>다시 조회</button>}
      {record && <>
        <p className="detail-meta">{record.recordType === 'MEMO' ? '메모' : '일기'} · {record.recordDate}</p>
        {editing ? <form onSubmit={event => { event.preventDefault(); void save() }}>
          <label htmlFor="edit-date">기록 날짜</label>
          <input id="edit-date" type="date" min="1000-01-01" max={dateString(new Date())} value={date} required disabled={busy} onChange={event => setDate(event.target.value)} />
          {record.recordType === 'DIARY' && <label>제목 (선택)<input value={title} maxLength={100} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>}
          <label htmlFor="edit-content">본문</label>
          <textarea id="edit-content" value={content} required maxLength={10000} disabled={busy} onChange={event => setContent(event.target.value)} />
          <p className="detail-meta">{content.length.toLocaleString()} / 10,000</p>
          <div className="detail-actions"><button type="submit" disabled={busy || !content.trim() || !date}>{busy ? '저장 중…' : '수정 저장'}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setError('') }}>취소</button></div>
        </form> : <>
          {record.title && <h3>{record.title}</h3>}
          <p className="detail-body">{record.content}</p>
          <p className="detail-meta">{record.embeddingStatus === 'COMPLETED' && record.indexedVersion === record.contentVersion ? 'AI 검색 준비 완료' : '원문 저장됨 · AI 검색 준비 전'}</p>
          <div className="detail-actions"><button disabled={busy} onClick={() => {
            setTitle(record.title ?? ''); setContent(record.content); setDate(record.recordDate); setError(''); setEditing(true)
          }}>수정</button><button className="danger" disabled={busy} onClick={remove}>{busy ? '처리 중…' : '영구 삭제'}</button></div>
        </>}
      </>}
    </section>
  )
}
