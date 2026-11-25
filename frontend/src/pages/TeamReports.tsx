import { useEffect, useState, type FormEvent } from 'react'
import { teamGet, teamWrite, withTeam, type TeamUser } from '../api/team'
import type { TeamMember } from '../api/team'

type ReportWork = { id: number; title: string; startDate: string; dueDate: string }
type WorkSummary = { completed: ReportWork[]; upcoming: ReportWork[] }
type Report = {
  userId: number; name: string; accomplishments: string; issues: string; nextPlan: string
  submittedAt: string | null; work: WorkSummary | null
}
type Reports = WorkSummary & { personal: Report | null; team: Report | null; submissions: Report[] }
const fields = { accomplishments: '주요 성과', issues: '이슈·지원 요청', nextPlan: '다음 주 계획' } as const
const fieldKeys = Object.keys(fields) as (keyof typeof fields)[]

function offsetDay(date: string, days: number) {
  const value = new Date(date)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function currentWeek() {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
  return offsetDay(date, -((new Date(date).getUTCDay() + 6) % 7))
}

function Summary({ work }: { work: WorkSummary }) {
  return <div className="ttech-report-summary">
    {([['완료 업무', work.completed], ['다음 주 예정', work.upcoming]] as const).map(([label, items]) =>
      <section key={label}><h4>{label}</h4>
        {items.length ? <ul>{items.map(item => <li key={item.id}>{item.title} <small>{item.dueDate}</small></li>)}</ul> : <p>업무가 없습니다.</p>}
      </section>)}
  </div>
}

function ReadReport({ report }: { report: Report }) {
  return <>
    <dl className="ttech-work-detail">{fieldKeys.map(field => <div className="ttech-report-field" key={field}>
      <dt>{fields[field]}</dt><dd>{report[field] || '—'}</dd>
    </div>)}</dl>
    {report.work && <Summary work={report.work} />}
  </>
}

function ReportForm({ report, publishLabel, busy, onSave }: {
  report: Report | null; publishLabel: string; busy: boolean
  onSave: (input: object) => void
}) {
  if (report?.submittedAt) return <ReadReport report={report} />
  return <form className="ttech-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    onSave({ ...Object.fromEntries(new FormData(event.currentTarget)), submit: submitter?.value === 'submit' })
  }}>
    {fieldKeys.map(field => <label key={field}>{fields[field]}
      <textarea name={field} defaultValue={report?.[field] ?? ''} maxLength={4000} rows={3} />
    </label>)}
    <div className="ttech-actions">
      <button type="submit" value="draft" disabled={busy}>초안 저장</button>
      <button type="submit" value="submit" disabled={busy}>{publishLabel}</button>
    </div>
  </form>
}

// 관리자는 teamId로 고른 팀의 게시된 팀 보고만 읽습니다.
export default function TeamReports({ user, members, teamId, readOnly = false, initialWeek }: { user: TeamUser; members: TeamMember[]; teamId?: number; readOnly?: boolean; initialWeek?: string }) {
  const [week, setWeek] = useState(() => initialWeek ?? currentWeek())
  const [mode, setMode] = useState<'personal' | 'team' | 'submissions'>(readOnly || initialWeek ? 'team' : 'personal')
  const [reports, setReports] = useState<Reports>()
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const lead = !readOnly && user.role === 'LEAD'
  const canReadSubmissions = lead || user.isAdmin

  useEffect(() => {
    const controller = new AbortController()
    teamGet<Reports>(withTeam('reports/' + week, teamId), controller.signal).then(setReports).catch(error => {
      if (!controller.signal.aborted) setError(error.message)
    })
    return () => controller.abort()
  }, [week, teamId])

  function move(days: number) {
    setReports(undefined)
    setError('')
    setFeedback('')
    setWeek(value => offsetDay(value, days))
  }

  async function save(kind: 'personal' | 'team', input: object) {
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await teamWrite('reports/' + week + '/' + kind, 'PUT', input)
      setReports(await teamGet<Reports>('reports/' + week))
      setFeedback('저장했습니다.')
    } catch (error) {
      setError(error instanceof Error ? error.message : '보고서를 저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="ttech-panel" aria-labelledby="ttech-report-title">
    <h2 id="ttech-report-title">주간보고</h2>
    <div className="ttech-actions ttech-calendar-nav">
      <button type="button" disabled={busy} onClick={() => move(-7)} aria-label="이전 주">‹</button>
      <strong>{week} ~ {offsetDay(week, 6)}</strong>
      <button type="button" disabled={busy} onClick={() => move(7)} aria-label="다음 주">›</button>
    </div>
    <div className="ttech-actions">
      {!readOnly && <button type="button" disabled={busy} aria-pressed={mode === 'personal'} onClick={() => setMode('personal')}>내 보고</button>}
      <button type="button" disabled={busy} aria-pressed={mode === 'team'} onClick={() => setMode('team')}>팀 보고</button>
      {canReadSubmissions && <button type="button" disabled={busy} aria-pressed={mode === 'submissions'} onClick={() => setMode('submissions')}>제출 현황</button>}
    </div>
    {error && <p role="alert" className="ttech-error">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    {!reports && !error && <p role="status">보고서를 불러오는 중입니다.</p>}
    {reports && mode === 'personal' && <>
      {!reports.personal?.submittedAt && <Summary work={reports} />}
      <ReportForm key={week + '/personal'} report={reports.personal} publishLabel="보고 제출" busy={busy} onSave={input => void save('personal', input)} />
    </>}
    {reports && mode === 'team' && (lead
      ? <ReportForm key={week + '/team'} report={reports.team} publishLabel="팀 보고 게시" busy={busy} onSave={input => void save('team', input)} />
      : reports.team ? <ReadReport report={reports.team} /> : <p>게시된 팀 보고가 없습니다.</p>)}
    {reports && mode === 'submissions' && canReadSubmissions && <div className="ttech-submissions">
      {reports.submissions.map(report => <details key={report.userId}>
        <summary>{report.name} · 제출</summary><ReadReport report={report} />
      </details>)}
      {members.filter(member => !reports.submissions.some(report => report.userId === member.id))
        .map(member => <p key={member.id}>{member.name} · 미제출</p>)}
    </div>}
  </section>
}
