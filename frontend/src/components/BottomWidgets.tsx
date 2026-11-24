import { Bell, CircleAlert, ClipboardList, CircleCheck } from 'lucide-react'
import { CategoryBadge, OverdueBadge } from './SharedBadges'
import { overdueDays, workCode, type Task, type View } from './smartwork-data'

export function WorkList({ tasks, open, toggle, kind, canEdit, pendingId, full = false }: {
  tasks: Task[]; open: (task: Task) => void; toggle: (task: Task) => void; kind: 'today' | 'notifications' | 'overdue' | 'completed'
  canEdit: (task: Task) => boolean; pendingId?: string; full?: boolean
}) {
  if (!tasks.length) return <p className={'sw-empty' + (full ? ' sw-empty-full' : '')}>표시할 업무가 없습니다.</p>
  return <ul className={'sw-work-list' + (full ? ' sw-work-list-full sw-work-list-' + kind : '')}>{tasks.map(task => <li key={task.id} className={task.status === '완료' ? 'is-done' : undefined}>
    <button type="button" className="sw-work-row" onClick={() => open(task)}>
      {kind !== 'overdue' && <time>{task.time ?? '—'}</time>}
      <CategoryBadge category={task.category} /><span><strong>{task.company || task.title}</strong><small>{workCode(task.id)} · {kind === 'notifications' ? task.alerts.join(' · ') : task.title || task.notes || task.end}</small>
        {full && <small className="sw-work-meta">{period(task)}{task.assigneeName && ' · 담당 ' + task.assigneeName} · {kind === 'completed' && task.completedDate ? task.completedDate + ' 완료' : task.status}</small>}</span>
      {kind === 'overdue' && <OverdueBadge days={overdueDays(task)} />}
    </button>
    {kind === 'today' && canEdit(task) && <button type="button" className="sw-icon-button" aria-label={`${task.company || task.title} 완료 상태 전환`} disabled={pendingId === task.id} aria-pressed={task.status === '완료'} onClick={() => toggle(task)}><CircleCheck size={full ? 20 : 17} /></button>}
  </li>)}</ul>
}

function period(task: Task) {
  return task.start === task.end ? task.start : task.start + ' ~ ' + task.end
}

export default function BottomWidgets({ today, notifications, overdue, open, toggle, navigate, canEdit, pendingId }: {
  today: Task[]; notifications: Task[]; overdue: Task[]; open: (task: Task) => void; toggle: (task: Task) => void; navigate: (view: View) => void
  canEdit: (task: Task) => boolean; pendingId?: string
}) {
  const widgets = [
    ['today', '오늘의 업무', today, ClipboardList], ['notifications', '알림', notifications, Bell], ['overdue', '기한 초과 업무', overdue, CircleAlert],
  ] as const
  return <div className="sw-widgets">{widgets.map(([id, name, tasks, Icon]) => <section className="sw-card" key={id}>
    <header><h2><Icon size={17} />{name} <span>({tasks.length}건)</span></h2><button type="button" onClick={() => navigate(id)} aria-label={name + ' 전체 보기'}>전체 보기 ›</button></header>
    <WorkList tasks={tasks} open={open} toggle={toggle} kind={id} canEdit={canEdit} pendingId={pendingId} />
  </section>)}</div>
}
