import { useEffect, useState, type FormEvent } from 'react'
import { teamGet, teamWrite, withTeam, type TeamUser } from '../api/team'

type Meeting = { author: string; authorId: number; agenda: string; decisions: string; followups: string; workIds: number[];
  approvalStatus: 'DRAFT' | 'PENDING' | 'APPROVED'; approvedBy: string | null; approvedAt: string | null }
type LinkedWork = { id: number; title: string; company: string | null; assigneeName: string }
type Kind = 'daily' | 'weekly'
const fields = { agenda: '안건과 진행 상황', decisions: '결정 사항', followups: '후속 업무와 담당자' } as const
const keys = Object.keys(fields) as (keyof typeof fields)[]

function period(kind: Kind) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
  if (kind === 'daily') return today
  const monday = new Date(today)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return monday.toISOString().slice(0, 10)
}

// 관리자는 teamId로 고른 팀의 보고서를 읽기 전용(readOnly)으로 봅니다.
export default function TeamMeetings({ user, kind, teamId, readOnly = false, initialDay }: {
  user: TeamUser; kind: Kind; teamId?: number; readOnly?: boolean; initialDay?: string
}) {
  const [day, setDay] = useState(() => initialDay ?? period(kind))
  const [result, setResult] = useState<{ day: string; value: Meeting | null; work: LinkedWork[] }>()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const path = `meetings/${kind}/${day}`
  const ready = result?.day === day
  const meeting = ready ? result.value : null
  const work = ready ? result.work : []
  const editable = !readOnly && (!meeting || (meeting.approvalStatus === 'DRAFT' && (user.role === 'LEAD' || meeting.authorId === user.id)))
  const canApprove = (!readOnly && user.role === 'LEAD') || (user.isAdmin && (user.title === '대표' || user.title === '본부장'))

  useEffect(() => {
    if (!day) return
    const controller = new AbortController()
    Promise.all([teamGet<Meeting | null>(withTeam(path, teamId), controller.signal), teamGet<LinkedWork[]>(withTeam(path + '/work', teamId), controller.signal)])
      .then(([value, work]) => setResult({ day, value, work })).catch(error => {
      if (!controller.signal.aborted) setError(error.message)
    })
    return () => controller.abort()
  }, [day, path, teamId])

  async function save(input: object, approving = false) {
    if (approving ? !canApprove : readOnly) return
    setPending(true)
    setError('')
    setSaved(false)
    try {
      const value = await teamWrite<Meeting>(withTeam(path + (approving ? '/approval' : ''), teamId), 'PUT', input)
      setResult({ day, value, work })
      setSaved(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : '회의 보고서를 저장하지 못했습니다.')
    } finally {
      setPending(false)
    }
  }

  return <section className="ttech-panel" aria-labelledby="meeting-title">
    <h2 id="meeting-title">{kind === 'daily' ? '일일회의 보고서' : '주간회의 보고서'}</h2>
    <div className="ttech-form">
      <label>{kind === 'daily' ? '회의 날짜' : '주간 기준일 (월요일)'}
        <input type="date" disabled={pending} value={day} onChange={event => {
          setDay(event.target.value)
          setError('')
          setSaved(false)
        }} />
      </label>
    </div>
    {meeting && <p>작성자 {meeting.author} · {meeting.approvalStatus === 'APPROVED' ? '결재 완료' : meeting.approvalStatus === 'PENDING' ? '결재대기' : '초안'}</p>}
    {meeting?.approvedBy && meeting.approvedAt && <p>결재자 {meeting.approvedBy} · {new Date(meeting.approvedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>}
    {error && <p role="alert" className="ttech-error">{error}</p>}
    {saved && <p role="status">저장했습니다.</p>}
    {!ready && day && !error && <p role="status">보고서를 불러오는 중입니다.</p>}
    {ready && (editable ? <form className="ttech-form" key={path} onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
      void save({ ...Object.fromEntries(keys.map(key => [key, data.get(key)])), workIds: data.getAll('work').map(Number), action: button?.value || 'draft' })
    }}>
      {keys.map(key => <label key={key}>{fields[key]}<textarea name={key} rows={3} maxLength={4000} defaultValue={meeting?.[key] ?? ''} /></label>)}
      <fieldset className="sw-report-checklist"><legend>캘린더 업무 체크리스트</legend>
        {work.map(item => <label key={item.id}><input name="work" type="checkbox" value={item.id} defaultChecked={meeting?.workIds.includes(item.id)} />{item.title} · {item.assigneeName}</label>)}
        {!work.length && <p>해당 기간에 연결할 팀 업무가 없습니다.</p>}
      </fieldset>
      <div className="ttech-actions">
        <button type="submit" value="draft" disabled={pending}>회의 보고서 저장</button>
        <button type="submit" value="submit" disabled={pending}>결재 상신</button>
      </div>
    </form> : <>
      <dl className="ttech-work-detail">
        {keys.map(key => <div className="ttech-report-field" key={key}><dt>{fields[key]}</dt><dd>{meeting?.[key] || '—'}</dd></div>)}
      </dl>
      {!!meeting?.workIds.length && <ul>{meeting.workIds.map(id => <li key={id}>{work.find(item => item.id === id)?.title ?? '현재 목록에서 제외된 업무'}</li>)}</ul>}
      {canApprove && meeting?.approvalStatus === 'PENDING' && <div className="ttech-actions"><button type="button" disabled={pending} onClick={() => void save({}, true)}>결재 완료</button></div>}
    </>)}
  </section>
}
