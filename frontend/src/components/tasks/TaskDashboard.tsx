import { useId } from 'react'
import type { Dashboard, TaskDayCount } from '../../api/tasks'
import { taskStatuses } from '../../api/tasks'
import useTaskQuery from './useTaskQuery'

function DayChart({ title, days, upcoming = false }: { title: string; days: TaskDayCount[]; upcoming?: boolean }) {
  const heading = useId()
  const maximum = Math.max(1, ...days.map(day => day.count))
  return <section className={upcoming ? 'task-upcoming-chart' : undefined} aria-labelledby={heading}>
    <h3 id={heading}>{title}</h3>
    <ol className="task-trend">
      {days.map(day => <li key={day.date} className={upcoming && day.count === maximum ? 'task-busiest-day' : undefined}>
        <strong>{day.count}</strong>
        <div className="task-bar-track" aria-hidden="true">
          <span style={{ height: `${day.count / maximum * 100}%` }} />
        </div>
        <time dateTime={day.date}>{day.date.slice(5).replace('-', '/')}</time>
      </li>)}
    </ol>
  </section>
}

function StatusChart({ total, doing, done }: Pick<Dashboard, 'total' | 'doing' | 'done'>) {
  const heading = useId()
  const todo = total - doing - done
  const todoEnd = total ? todo / total * 100 : 0
  const doingEnd = total ? (todo + doing) / total * 100 : 0
  const background = total
    ? `conic-gradient(var(--task-todo) 0 ${todoEnd}%, var(--task-doing) ${todoEnd}% ${doingEnd}%, var(--task-done) ${doingEnd}% 100%)`
    : 'var(--task-empty)'
  return <section className="task-status-chart" aria-labelledby={heading}>
    <h3 id={heading}>내 일정, 지금은</h3>
    <div className="task-donut-layout">
      <div className="task-donut" style={{ background }}>
        <div><strong>{total}</strong><small>전체</small></div>
      </div>
      <ul className="task-donut-legend">
        <li className="task-donut-todo">{taskStatuses.TODO} <strong>{todo}건</strong></li>
        <li className="task-donut-doing">{taskStatuses.DOING} <strong>{doing}건</strong></li>
        <li className="task-donut-done">{taskStatuses.DONE} <strong>{done}건</strong></li>
      </ul>
    </div>
  </section>
}

export default function TaskDashboard({ revision, onRetry }: { revision: number; onRetry: () => void }) {
  const result = useTaskQuery<Dashboard>('/api/tasks/dashboard', revision)
  const data = result?.data
  return <section className="task-panel task-dashboard" aria-labelledby="task-dashboard-title">
    <h2 id="task-dashboard-title">내 일정 한눈에</h2>
    {!result && <p role="status">집계를 불러오는 중입니다…</p>}
    {result?.error && <p role="alert">{result.error} <button onClick={onRetry}>집계 다시 조회</button></p>}
    {data && <>
      <StatusChart total={data.total} doing={data.doing} done={data.done} />
      <DayChart title="일주일 안에 끝낼 일" days={data.upcomingDue ?? []} upcoming />
      <div className={data.overdue ? 'task-overdue task-danger' : 'task-overdue'}>
        <span>기한이 지난 일</span><strong>{data.overdue}건</strong>
      </div>
      <DayChart title="지난 일주일에 끝낸 일" days={data.trend} />
    </>}
  </section>
}
