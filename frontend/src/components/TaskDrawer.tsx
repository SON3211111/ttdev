import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronRight, Plus, Search, X } from 'lucide-react'
import { teamGet } from '../api/team'
import { CategoryBadge } from './SharedBadges'
import { KindContext } from './kind-context'
import { alertOptions, categoriesByKind, workCode, type Category, type Task, type WorkStatus } from './smartwork-data'

export type DrawerState = { date: string; task?: Task; source?: Task }
const statuses: WorkStatus[] = ['대기', '진행 중', '완료']
const historyLabels: Record<string, string> = {
  startDate: '시작일', dueDate: '종료일', time: '시작 시각', endTime: '종료 시각', status: '상태', assigneeId: '담당자',
}
const historyStatuses: Record<string, WorkStatus> = { WAITING: '대기', IN_PROGRESS: '진행 중', DONE: '완료' }
const localDateTime = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' })
type WorkChange = { id: number; actorName: string; changedAt: string; changes: Record<string, { before: string | null; after: string | null }> }

function historyValue(field: string, value: string | null) {
  if (value === null) return '미정'
  return field === 'status' ? historyStatuses[value] ?? value : value
}

function WorkHistory({ path }: { path: string }) {
  const [entries, setEntries] = useState<WorkChange[]>()
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    teamGet<WorkChange[]>(path, controller.signal).then(setEntries).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '변경 이력을 읽지 못했습니다.')
    })
    return () => controller.abort()
  }, [path])

  return <details>
    <summary>변경 이력</summary>
    {error && <p role="alert" className="sw-error">{error}</p>}
    {!error && !entries && <p role="status">변경 이력을 불러오는 중입니다.</p>}
    {entries?.length === 0 && <p>저장된 변경 이력이 없습니다.</p>}
    {!!entries?.length && <ul>{entries.map(entry => <li key={entry.id}>
      <p>{entry.actorName} · {localDateTime.format(new Date(entry.changedAt))}</p>
      {Object.entries(entry.changes).map(([field, value]) => <p key={field}>{historyLabels[field]} {historyValue(field, value.before)} → {historyValue(field, value.after)}</p>)}
    </li>)}</ul>}
  </details>
}

export default function TaskDrawer({ state, dismiss, save, remove, canEdit, members, openDelivery, openQuote, historyPath, inline = false, openFull }: {
  state: DrawerState; dismiss: () => void; save: (task: Task) => Promise<void>; remove: (id: string) => Promise<void>
  canEdit: boolean; members: { id: number; name: string }[]
  openDelivery?: (task: Task) => void; openQuote: (id: number) => void; historyPath?: string
  inline?: boolean; openFull?: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const { task, date, source } = state
  const kind = useContext(KindContext)
  // 팀 유형의 구분을 보여주고, 팀 유형이 바뀌기 전에 저장된 구분이면 그 구분도 함께 보여줍니다.
  const choices = [...new Set([...categoriesByKind[kind], ...(task ? [task.category] : [])])]
  const [category, setCategory] = useState<Category>(source ? 'delivery' : task?.category ?? categoriesByKind[kind][0])
  const [enabled, setEnabled] = useState(!!task?.alerts.length)
  const [alerts, setAlerts] = useState(task?.alerts.length ? task.alerts : ['3일 전'])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  // 넓은 화면(1280px 이상)에서는 와이어프레임처럼 캘린더 옆에 고정 패널로 열고, 좁은 화면에서는 화면을 덮는 패널로 엽니다.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (window.matchMedia('(min-width: 1280px)').matches) {
      dialog.show()
      dialog.querySelector<HTMLElement>('header button, input, select, textarea')?.focus()
    } else dialog.showModal()
    return () => dialog.close()
  }, [])

  async function run(action: () => Promise<void>) {
    setPending(true)
    setError('')
    try { await action() }
    catch (error) { setError(error instanceof Error ? error.message : '변경 사항을 저장하지 못했습니다.') }
    finally { setPending(false) }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || pending) return
    const data = new FormData(event.currentTarget)
    const company = source?.company ?? String(data.get('company')).trim()
    const start = String(data.get('start'))
    const end = String(data.get('end'))
    const title = String(data.get('title') ?? '').trim()
    if ((!company && !title) || !start || !end || start > end) {
      setError('업체명이나 업무 제목을 입력하고 종료일을 시작일 이후로 지정해 주세요.')
      return
    }
    const status = String(data.get('status') ?? '대기') as WorkStatus
    void run(() => save({
      ...task, id: task?.id ?? '', category, company, start, end,
      alerts: enabled ? [...new Set(alerts)] : [], repeat: enabled ? String(data.get('repeat')) : '없음',
      notes: source?.notes ?? String(data.get('notes')).trim(), status, time: String(data.get('time') ?? ''),
      endTime: String(data.get('endTime') ?? ''),
      title, assigneeId: Number(data.get('assignee')) || task?.assigneeId,
    }))
  }

  const content = <>
    <header><ChevronRight size={19} /><h2 id="sw-drawer-title">{source ? '납품 등록' : task ? canEdit ? '업무 상세 · 수정' : '업무 상세' : '새 업무 등록'}</h2>
      {openFull && <button className="sw-secondary" type="button" onClick={openFull}>전체 상세</button>}
      {!inline && <button className="sw-icon-button" type="button" aria-label="업무 패널 닫기" disabled={pending} onClick={dismiss}><X size={20} /></button>}
    </header>
    <form onSubmit={submit}>
      <fieldset className="sw-drawer-fields" disabled={!canEdit || pending}>
        {error && <p role="alert" className="sw-error">{error}</p>}
        {task && <p>{workCode(task.id)} · 등록자 {task.createdByName || '미정'}
          {task.createdAt && <> · <time dateTime={task.createdAt}>{localDateTime.format(new Date(task.createdAt))}</time></>}</p>}
        <fieldset><legend>업무구분</legend><div className="sw-categories">{choices.map(value =>
          <button type="button" key={value} disabled={!!source} aria-pressed={value === category} onClick={() => setCategory(value)}><CategoryBadge category={value} /></button>)}</div></fieldset>
        <label>{kind === 'SALES' ? '업체명' : '관련 업체'}<span className="sw-input-icon"><Search size={16} /><input name="company" placeholder="업체명을 입력하세요…" defaultValue={source?.company ?? task?.company} maxLength={160} readOnly={!!source} /></span></label>
        <label>업무 제목<input name="title" defaultValue={source ? (source.title || source.company) + ' 납품' : task?.title} maxLength={100} /></label>
        {members.length > 0 && <label>담당자<select name="assignee" defaultValue={task?.assigneeId ?? ''}>
          {task?.assigneeId && !members.some(member => member.id === task.assigneeId) && <option value={task.assigneeId}>{task.assigneeName} (기존 담당자)</option>}
          {!task && <option value="">내 업무로 등록</option>}{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select></label>}
        {!!task?.assigneeName && members.length === 0 && <p>담당자 {task.assigneeName}</p>}
        <fieldset><legend>일정</legend><div className="sw-date-inputs">
          <label>시작일<input name="start" type="date" required defaultValue={task?.start ?? date} /></label>
          <label>종료일<input name="end" type="date" required defaultValue={task?.end ?? date} /></label>
        </div>
          <div className="sw-date-inputs">
            <label>시작 시각<input name="time" type="time" defaultValue={task?.time} /></label>
            <label>종료 시각<input name="endTime" type="time" defaultValue={task?.endTime} /></label>
          </div>
          {task && <p>총 {Math.round((Date.parse(task.end) - Date.parse(task.start)) / 86_400_000) + 1}일간</p>}
        </fieldset>
        <fieldset><legend>알림 설정</legend>
          <label className="sw-switch"><input type="checkbox" role="switch" checked={enabled} onChange={event => setEnabled(event.target.checked)} />알림 사용</label>
          {enabled && <>
            {alerts.map((alert, index) => <div className="sw-alert-setting" key={index}>
              <select aria-label={`알림 시점 ${index + 1}`} value={alert} onChange={event => setAlerts(values => values.map((value, i) => index === i ? event.target.value : value))}>
                {alertOptions.map(value => <option key={value}>{value}</option>)}
              </select>
              {alerts.length > 1 && <button type="button" className="sw-icon-button" aria-label={`알림 ${index + 1} 삭제`} onClick={() => setAlerts(values => values.filter((_, i) => index !== i))}><X size={16} /></button>}
            </div>)}
            {alerts.length < alertOptions.length && <button className="sw-secondary" type="button" onClick={() => setAlerts(values => [...values, alertOptions.find(value => !values.includes(value)) ?? '당일'])}><Plus size={15} />알림 추가</button>}
          </>}
        </fieldset>
        <label>반복 알림<select name="repeat" disabled={!enabled} defaultValue={task?.repeat ?? '없음'}><option>없음</option><option>매일</option><option>매주</option></select></label>
        {task && <label>상태<select name="status" defaultValue={task.status}>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>}
        <label>업무 내용 / 비고<textarea name="notes" rows={4} maxLength={2000} defaultValue={source?.notes ?? task?.notes} readOnly={!!source} placeholder="업무 내용과 참고 사항을 입력하세요…" /></label>
        {historyPath && <WorkHistory key={historyPath} path={historyPath} />}
      </fieldset>
      <footer>{task && canEdit && <button className="sw-danger" type="button" disabled={pending} onClick={() => { if (window.confirm('이 업무를 삭제할까요?')) void run(() => remove(task.id)) }}>삭제</button>}
        {inline && <>
          <button className="sw-secondary" type="button" disabled={pending} onClick={() => void run(async () => {
            await navigator.clipboard.writeText(location.href)
            setCopied(true)
          })}>{copied ? '링크 복사됨' : '링크 복사'}</button>
          <button className="sw-secondary" type="button" onClick={() => window.print()}>인쇄</button>
        </>}
        {task?.sourceQuoteId && <button className="sw-secondary" type="button" disabled={pending} onClick={() => openQuote(task.sourceQuoteId!)}>원본 견적</button>}
        {task && canEdit && openDelivery && task.category === 'estimate' && task.status === '완료' && <button className="sw-secondary" type="button" disabled={pending} onClick={() => openDelivery(task)}>납품 등록</button>}
        <button className="sw-secondary" type="button" disabled={pending} onClick={dismiss}>{inline ? '캘린더로 돌아가기' : '닫기'}</button>
        {canEdit && <button className="sw-primary" type="submit" disabled={pending}>업무 저장</button>}</footer>
    </form>
  </>
  if (inline) return <section className="sw-drawer sw-inline-detail" aria-labelledby="sw-drawer-title" onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && canEdit) {
      event.preventDefault()
      event.currentTarget.querySelector('form')?.requestSubmit()
    }
  }}>{content}</section>
  return <dialog ref={ref} className="sw-drawer" aria-labelledby="sw-drawer-title" onCancel={event => { event.preventDefault(); if (!pending) dismiss() }}
    onKeyDown={event => { if (event.key === 'Escape' && !ref.current?.matches(':modal') && !pending) dismiss() }}>
    {content}
  </dialog>
}
