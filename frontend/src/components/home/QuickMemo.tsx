/**
 * 메모 본문과 날짜를 입력받는 화면입니다. 서버 호출은 부모 HomePage의 onSave에 맡깁니다.
 * onSave는 부모가 전달한 함수입니다. 이처럼 자식이 부모의 함수를 부르는 것을 콜백이라고 합니다.
 * 저장에 성공한 뒤에만 본문을 비우고, 실패하면 작성한 내용과 날짜를 그대로 둡니다.
 */
import './QuickMemo.css'
import { useRef, useState } from 'react'
import { dateString, today } from '../../utils/date'

type Props = {
  onSave: (content: string, date: string) => Promise<void>
  onWriteDiary: () => void
}

export default function QuickMemo({ onSave, onWriteDiary }: Props) {
  const [content, setContent] = useState('')
  const [date, setDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // saving은 버튼을 '저장 중'으로 바꾸는 화면용 상태입니다.
  // useRef의 current 값은 화면을 다시 그리지 않고 즉시 바뀌므로, 빠른 두 번 클릭도 막을 수 있습니다.
  const submitting = useRef(false)
  const input = useRef<HTMLTextAreaElement>(null)
  // 입력이 유효할 때만 저장 버튼을 켭니다. 서버도 같은 검사를 하므로 화면 검사를 우회해도 잘못 저장되지 않습니다.
  const canSave = Boolean(content.trim() && content.trim().length <= 10000 && date >= '1000-01-01' && date <= dateString(new Date()))

  // try: 저장을 시도, catch: 실패 안내, finally: 성공/실패와 상관없이 잠금을 풀어 다시 작성하게 합니다.
  // await onSave가 실패하면 setContent('')를 건너뛰므로 입력이 사라지지 않습니다.
  async function save() {
    if (!canSave || submitting.current) return
    submitting.current = true
    setSaving(true)
    setError('')
    try {
      await onSave(content.trim(), date)
      setContent('')
    } catch (error) {
      setError(error instanceof Error ? error.message : '저장하지 못했습니다.')
    } finally {
      submitting.current = false
      setSaving(false)
      // 다음 화면 갱신 때 입력창의 disabled가 풀린 뒤 커서를 돌려줍니다. 바로 다음 메모를 쓸 수 있습니다.
      requestAnimationFrame(() => input.current?.focus())
    }
  }

  return (
    <section className="memo card" aria-labelledby="memo-title">
      <div className="section-head">
        <h2 id="memo-title"><span className="swirl"></span>MEMO</h2>
        <button className="diary-button" onClick={onWriteDiary}>일기 쓰기</button>
      </div>
      <p className="description">짧은 생각은 메모로, 긴 이야기는 일기로 남겨보세요.</p>
      <label className="sr-only" htmlFor="memo">메모 본문</label>
      <textarea
        id="memo"
        ref={input}
        value={content}
        disabled={saving}
        maxLength={10000}
        onChange={event => setContent(event.target.value)}
        placeholder={'지금 남기고 싶은 기억이 있나요?\n제목 없이, 본문만 적어도 괜찮아요.'}
      />
      <div className="memo-bottom">
        <label>기록 날짜
          <input type="date" min="1000-01-01" max={dateString(new Date())} disabled={saving} value={date} onChange={event => setDate(event.target.value)} />
        </label>
        <button className="primary" disabled={!canSave || saving} onClick={save}>{saving ? '저장 중…' : '＋ 메모 남기기'}</button>
      </div>
      <p className="input-hint">오늘 또는 지난 날짜의 기억을 남길 수 있어요. · {content.length.toLocaleString()} / 10,000</p>
      {error && <p className="memo-error" role="alert">{error}</p>}
    </section>
  )
}
