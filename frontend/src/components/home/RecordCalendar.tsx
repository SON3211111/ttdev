/**
 * 월간 달력에 메모·일기·일정을 모으고, 선택한 날짜에서 작성과 상세 열기를 연결합니다.
 * month는 보고 있는 월('2026-11'), selectedDate는 클릭한 날짜('2026-11-17')입니다.
 * 부모가 revision을 올리면 현재 월을 다시 읽고, savedDate를 보내면 저장한 날짜로 이동합니다.
 */
import { useEffect, useRef, useState } from 'react'
import { recordsApi } from '../../api/records'
import { schedulesApi } from '../../api/schedules'
import { tasksApi, taskStatuses, type CalendarTask } from '../../api/tasks'
import type { RecordSummary } from '../../types/record'
import { statusLabels, type CalendarSchedule, type Schedule } from '../../types/schedule'
import { dateString, today } from '../../utils/date'
import DiaryForm from './DiaryForm'
import QuickMemo from './QuickMemo'
import ScheduleEditor from './ScheduleEditor'
import './RecordCalendar.css'

type Props = {
  revision: number
  scheduleRevision: number
  taskRevision: number
  savedDate: { date: string } | null
  onSelect: (id: string) => void
  onOpenTask: (id: string) => void
  onSaveMemo: (content: string, date: string) => Promise<void>
  onDiarySaved: (date: string) => void
  onScheduleChanged: () => void
}

type Editor =
  | { kind: 'memo' | 'diary'; date: string }
  | { kind: 'schedule'; date: string; schedule: Schedule | null }

export default function RecordCalendar({
  revision, scheduleRevision, taskRevision, savedDate, onSelect, onOpenTask, onSaveMemo, onDiarySaved, onScheduleChanged,
}: Props) {
  const [selectedDate, setSelectedDate] = useState(today)
  const dialog = useRef<HTMLDialogElement>(null)
  const [result, setResult] = useState<{
    key: string; records: RecordSummary[]; schedules: CalendarSchedule[]; tasks: CalendarTask[]; error: string
  } | null>(null)
  const [retry, setRetry] = useState(0)
  const [previousSavedDate, setPreviousSavedDate] = useState(savedDate)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [opening, setOpening] = useState(false)
  const [detailError, setDetailError] = useState<{ id: string; message: string } | null>(null)
  const editorOpen = editor !== null || opening
  const closeEditor = () => setEditor(null)

  // 부모가 새 savedDate 객체를 보냈는지 이전 값과 비교합니다. 같을 때는 상태를 바꾸지 않아 반복을 막습니다.
  // 값이 다르면 React가 이 컴포넌트를 다시 그립니다. 새 월이 결정된 뒤 effect가 조회를 시작합니다.
  if (savedDate !== previousSavedDate) {
    setPreviousSavedDate(savedDate)
    if (savedDate) setSelectedDate(savedDate.date)
  }
  const month = selectedDate.slice(0, 7)
  // 월이나 갱신 횟수가 바뀌면 새로운 조회가 필요합니다.
  // 이름표가 달라지면 이전 월의 개수/목록은 숨기고 새 응답이 올 때까지 로딩을 표시합니다.
  const queryKey = `${month}:${revision}:${scheduleRevision}:${taskRevision}:${retry}`
  const current = result?.key === queryKey ? result : null
  const loading = current === null
  const records = current?.records ?? []
  const schedules = current?.schedules ?? []
  const tasks = current?.tasks ?? []
  const error = current?.error ?? ''

  useEffect(() => {
    // 월 이동 도중 이전 조회가 늦게 끝나도 현재 달력을 덮어쓰지 않도록 취소 신호를 함께 보냅니다.
    const controller = new AbortController()
    Promise.all([
      recordsApi.month(month, controller.signal),
      schedulesApi.month(month, controller.signal),
      tasksApi.month(month, controller.signal),
    ]).then(([records, schedules, tasks]) => {
      if (!controller.signal.aborted) setResult({ key: queryKey, records, schedules, tasks, error: '' })
    }).catch(reason => {
      if (!controller.signal.aborted) setResult({
        key: queryKey, records: [], schedules: [], tasks: [],
        error: reason instanceof Error ? reason.message : '캘린더를 불러오지 못했습니다.',
      })
    })
    return () => controller.abort()
  }, [month, queryKey])

  // getUTCDay(): 1일의 요일(일=0~토=6). 그 수만큼 빈칸을 넣어 달력의 시작 위치를 맞춥니다.
  // Date.UTC의 월은 0부터 시작하며, 다음 달의 0일은 이번 달의 마지막 날입니다.
  const [year, number] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, number - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const dateRecords = records.filter(item => item.recordDate === selectedDate)
  const dateSchedules = schedules.filter(item => item.scheduleDate === selectedDate)
  const dateTasks = tasks.filter(item => item.dueDate === selectedDate)
  const canWriteRecord = selectedDate <= dateString(new Date())

  function selectDate(date: string) {
    setSelectedDate(date)
    setDetailError(null)
  }

  function openDay(date: string) {
    selectDate(date)
    dialog.current?.showModal()
  }

  function move(offset: number) {
    // offset=-1은 이전 달, +1은 다음 달입니다. Date가 12월↔1월의 연도 변경도 계산합니다.
    const date = new Date(Date.UTC(year, number - 1 + offset, 1))
    const next = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    selectDate(`${next}-01`)
  }

  // 달력에는 약속 요약만 있으므로 수정창을 열기 전에 장소와 메모를 포함한 상세를 가져옵니다.
  async function openSchedule(id: string) {
    setOpening(true)
    setDetailError(null)
    try {
      const schedule = await schedulesApi.detail(id)
      setEditor({ kind: 'schedule', date: schedule.scheduleDate, schedule })
    } catch (error) {
      setDetailError({ id, message: error instanceof Error ? error.message : '일정을 불러오지 못했습니다.' })
    } finally {
      setOpening(false)
    }
  }

  function scheduleChanged(date?: string) {
    closeEditor()
    if (date) selectDate(date)
    onScheduleChanged()
  }

  // aria-*는 화면 읽기 프로그램에 선택 날짜와 로딩 상태를 알려주는 속성입니다.
  return <section className="record-calendar" id="calendar" aria-labelledby="calendar-title" aria-busy={loading}>
    <div className="calendar-heading"><h2 id="calendar-title">캘린더</h2><button disabled={editorOpen} onClick={() => selectDate(dateString(new Date()))}>오늘</button></div>
    <nav className="calendar-month" aria-label="캘린더 월 이동">
      <button aria-label="이전 달" disabled={editorOpen || month === '1000-01'} onClick={() => move(-1)}>‹</button>
      <strong>{year}년 {number}월</strong>
      <button aria-label="다음 달" disabled={editorOpen || month === '9999-12'} onClick={() => move(1)}>›</button>
    </nav>
    {loading && <p role="status">캘린더를 불러오는 중입니다…</p>}
    {error && <p role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>다시 조회</button></p>}
    <div className="calendar-days">
      {['일', '월', '화', '수', '목', '금', '토'].map(label => <span className="weekday" key={label}>{label}</span>)}
      {Array.from({ length: first }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length: days }, (_, index) => {
        const date = `${month}-${String(index + 1).padStart(2, '0')}`
        const dayRecords = records.filter(item => item.recordDate === date)
        const dayTasks = tasks.filter(item => item.dueDate === date)
        // 완료한 일도 마감일 칸에 남기고, 미완료 건수와 완료 건수는 따로 표시합니다.
        const completedTaskCount = dayTasks.filter(item => item.status === 'DONE').length
        const counts = [
          { kind: 'memo', label: '메모', count: dayRecords.filter(item => item.recordType === 'MEMO').length },
          { kind: 'diary', label: '일기', count: dayRecords.filter(item => item.recordType === 'DIARY').length },
          { kind: 'schedule', label: '약속', count: schedules.filter(item => item.scheduleDate === date).length },
          { kind: 'task', label: '할 일', count: dayTasks.length - completedTaskCount },
          { kind: 'task-done', label: '완료한 일', count: completedTaskCount },
        ].filter(item => item.count > 0)
        const summary = counts.map(item => `${item.label} ${item.count}개`).join(', ')
        return <button key={date} className={selectedDate === date ? 'chosen' : ''}
          disabled={editorOpen} aria-pressed={selectedDate === date} aria-haspopup="dialog" aria-current={date === today ? 'date' : undefined}
          aria-label={`${date}, ${loading ? '조회 중' : error ? '조회 실패' : summary || '항목 없음'}`}
          onClick={() => openDay(date)}>
          <span>{index + 1}</span>
          {counts.map(item => <small key={item.kind} className={`calendar-${item.kind}`}>{item.label} {item.count}</small>)}
        </button>
      })}
    </div>
    <dialog ref={dialog} className="calendar-dialog" aria-labelledby="calendar-day-title"
      onCancel={event => { if (editorOpen) event.preventDefault() }}
      onClick={event => { if (event.target === event.currentTarget && !editorOpen) event.currentTarget.close() }}>
      <div className="calendar-day-sheet">
        <header className="calendar-day-header">
          <h3 id="calendar-day-title"><time dateTime={selectedDate}>
            {new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${selectedDate}T12:00:00`))}
          </time></h3>
          <button type="button" aria-label="날짜 팝업 닫기" disabled={editorOpen} onClick={() => dialog.current?.close()}>×</button>
        </header>
        <div className="calendar-records" hidden={editor !== null} aria-busy={loading || opening}>
          {loading && <p role="status">기록과 일정을 불러오는 중이에요.</p>}
          {error && <p role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>다시 조회</button></p>}
          {!loading && !error && dateRecords.length === 0 && dateSchedules.length === 0 && dateTasks.length === 0 &&
            <p>이 날짜에는 기록과 일정이 없어요.</p>}
          {dateRecords.map(item => <button className="calendar-entry" key={item.id} disabled={editorOpen} onClick={() => {
            dialog.current?.close()
            onSelect(item.id)
          }}>
            <span className={item.recordType === 'MEMO' ? 'calendar-memo' : 'calendar-diary'}>{item.recordType === 'MEMO' ? '메모' : '일기'}</span>
            <span>{item.title || item.preview}</span><span aria-hidden="true">↗</span>
          </button>)}
          {dateSchedules.map(item => <button className="calendar-entry" key={`schedule-${item.id}`} disabled={editorOpen} onClick={() => void openSchedule(item.id)}>
            <span className="calendar-schedule">약속</span>
            <span>{item.title}</span><span>{statusLabels[item.status]} · {item.scheduleTime || '시간 미정'}</span>
          </button>)}
          {dateTasks.map(item => <button className="calendar-entry" key={`task-${item.id}`} disabled={editorOpen} onClick={() => {
            dialog.current?.close()
            onOpenTask(item.id)
          }}>
            <span className="calendar-task">할 일</span>
            <span>{item.title}</span><span>{taskStatuses[item.status]}</span>
          </button>)}
          {opening && <p role="status">일정 상세를 불러오는 중입니다…</p>}
          {detailError && <p role="alert">{detailError.message} <button disabled={editorOpen} onClick={() => void openSchedule(detailError.id)}>상세 다시 조회</button></p>}
        </div>
        {editor?.kind === 'memo' && <QuickMemo initialDate={editor.date} onClose={closeEditor} onSave={async (content, date) => {
          await onSaveMemo(content, date)
          closeEditor()
        }} />}
        {editor?.kind === 'diary' && <DiaryForm initialDate={editor.date} onClose={closeEditor} onSaved={date => {
          onDiarySaved(date)
          closeEditor()
        }} />}
        {editor?.kind === 'schedule' && <ScheduleEditor schedule={editor.schedule} initialDate={editor.date}
          onClose={closeEditor} onSaved={schedule => scheduleChanged(schedule.scheduleDate)} onDeleted={() => scheduleChanged()} />}
        {!editor && <footer className="calendar-actions">
          {canWriteRecord && <button disabled={opening} onClick={() => setEditor({ kind: 'memo', date: selectedDate })}>메모 쓰기</button>}
          {canWriteRecord && <button disabled={opening} onClick={() => setEditor({ kind: 'diary', date: selectedDate })}>일기 쓰기</button>}
          <button className="calendar-add-schedule" disabled={opening} onClick={() => setEditor({ kind: 'schedule', date: selectedDate, schedule: null })}>일정 추가</button>
        </footer>}
      </div>
    </dialog>
  </section>
}
