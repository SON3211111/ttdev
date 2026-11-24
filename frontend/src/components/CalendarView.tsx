import { useContext } from 'react'
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Plus } from 'lucide-react'
import { CategoryBadge } from './SharedBadges'
import { KindContext } from './kind-context'
import { categoryLabel, dateKey, overdueDays, overlaps, shiftDate, type Task } from './smartwork-data'

export type CalendarMode = 'month' | 'week' | 'day'
const modes = { month: '월', week: '주', day: '일' }
const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const monthLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', timeZone: 'UTC' })

export default function CalendarView({ cursor, setCursor, mode, setMode, tasks, open, create, today, readOnly = false }: {
  cursor: string; setCursor: (date: string) => void; mode: CalendarMode; setMode: (mode: CalendarMode) => void
  tasks: Task[]; open: (task: Task) => void; create: (date: string) => void; today: string; readOnly?: boolean
}) {
  const kind = useContext(KindContext)
  const [year, month] = cursor.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1, 1))
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstKey = mode === 'month' ? shiftDate(dateKey(first), -first.getUTCDay())
    : mode === 'week' ? shiftDate(cursor, -new Date(cursor).getUTCDay()) : cursor
  const count = mode === 'month' ? Math.ceil((length + first.getUTCDay()) / 7) * 7 : mode === 'week' ? 7 : 1

  function move(direction: number) {
    setCursor(mode === 'month' ? dateKey(new Date(Date.UTC(year, month - 1 + direction, 1))) : shiftDate(cursor, direction * count))
  }

  return <section className="sw-card sw-calendar" aria-label="영업 캘린더">
    <header className="sw-calendar-tools">
      <div className="sw-toolbar">
        <button className="sw-secondary" type="button" onClick={() => setCursor(today)}>오늘</button>
        <div className="sw-period-nav">
          <button type="button" onClick={() => move(-1)} aria-label="이전 기간"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => move(1)} aria-label="다음 기간"><ChevronRight size={18} /></button>
        </div>
        <h2>{mode === 'day' ? cursor : monthLabel.format(first)}</h2>
      </div>
      <div className="sw-toolbar">
        <div className="sw-mode" aria-label="캘린더 보기">{(Object.keys(modes) as CalendarMode[]).map(value =>
          <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{modes[value]}</button>)}</div>
        {!readOnly && <button className="sw-primary" type="button" onClick={() => create(cursor)}><Plus size={16} />새 업무 등록</button>}
      </div>
    </header>
    <div className={`sw-days sw-days-${mode}`}>
      {(mode === 'day' ? [weekdays[new Date(cursor).getUTCDay()]] : weekdays).map(day => <div className="sw-weekday" key={day}>{day}</div>)}
      {Array.from({ length: count }, (_, i) => {
        const date = shiftDate(firstKey, i)
        const list = tasks.filter(task => overlaps(task, date))
        return <div key={date} className={`sw-day ${date === cursor ? 'sw-day-selected' : ''} ${date === today ? 'sw-day-today' : ''} ${date.slice(0, 7) !== cursor.slice(0, 7) ? 'sw-other-month' : ''}`}>
          <button type="button" className="sw-date" aria-label={date + ' 업무 조회'} aria-pressed={date === cursor} onClick={() => setCursor(date)}>
            <span>{Number(date.slice(-2))}</span>{date === today && <small>오늘</small>}
            <span className="sw-mobile-count">{list.length || ''}</span>
          </button>
          <div className="sw-events">
            {list.map(task => {
              const late = overdueDays(task), done = task.status === '완료', label = categoryLabel(task.category, kind)
              return <button className={`sw-event sw-event-${done ? 'done' : task.category}${late > 0 ? ' sw-event-overdue' : ''}`} key={task.id} type="button"
                onClick={() => open(task)} title={`${label} · ${task.company || task.title}${done ? ' · 완료' : ''}`}>
                <span className="sw-event-cat">{late > 0 ? <CircleAlert size={13} aria-hidden="true" /> : done ? <CircleCheck size={13} aria-hidden="true" /> : <i aria-hidden="true" />}{done ? '완료' : label}</span>
                <span className="sw-event-name">{task.company || task.title}{late > 0 && ` (D+${late})`}</span>
              </button>
            })}
          </div>
        </div>
      })}
    </div>
    <div className="sw-date-list">
      <strong>{cursor} 업무</strong>
      {tasks.filter(task => overlaps(task, cursor)).map(task => <button key={task.id} type="button" onClick={() => open(task)}><CategoryBadge category={task.category} /> {task.company || task.title}</button>)}
      {!tasks.some(task => overlaps(task, cursor)) && <p>등록된 업무가 없습니다.</p>}
    </div>
  </section>
}
