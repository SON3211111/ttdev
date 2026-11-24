import type { TeamKind } from '../api/team'

// 팀 유형별 업무 구분. meeting은 영업형에서 '업무협의', 다른 유형에서 '회의'로 표시합니다.
export type Category = 'estimate' | 'meeting' | 'delivery' | 'etc' | 'develop' | 'test' | 'field' | 'purchase' | 'approval' | 'hr' | 'accounting'
export type WorkStatus = '대기' | '진행 중' | '완료'
export type Task = {
  id: string; category: Category; company: string; start: string; end: string; notes: string
  alerts: string[]; repeat: string; status: WorkStatus; time?: string; title?: string
  assigneeId?: number; assigneeName?: string; completedDate?: string
  endTime?: string; createdAt?: string; createdByName?: string
  sourceQuoteId?: number
}
export type View = 'portal' | 'calendar' | 'clients' | 'reports' | 'settings' | 'today' | 'notifications' | 'overdue' | 'completed' | 'workspace'
export const smartViews = new Set<string>(['portal', 'calendar', 'clients', 'reports', 'settings', 'today', 'notifications', 'overdue', 'completed', 'workspace'])
export const workDetailRoute = /^(work|personal-work)\/(\d+)(?:\?team=(\d+))?$/
export type WorkDetailLocation = `work/${string}` | `personal-work/${string}`
export const meetingDetailRoute = /^team-reports\?kind=(daily|weekly)&date=(\d{4}-\d{2}-\d{2})(?:&team=(\d+))?$/
export const workCode = (id: string) => 'TSK-' + id.padStart(4, '0')
export const categoriesByKind: Record<TeamKind, Category[]> = {
  SALES: ['estimate', 'meeting', 'delivery', 'etc'],
  DEV: ['develop', 'test', 'field', 'meeting', 'etc'],
  TECH: ['develop', 'test', 'field', 'meeting', 'etc'],
  SUPPORT: ['purchase', 'approval', 'hr', 'accounting', 'etc'],
}
const labels: Record<Category, string> = {
  estimate: '견적', meeting: '업무협의', delivery: '납품', etc: '기타', develop: '개발', test: '테스트', field: '현장지원',
  purchase: '구매', approval: '결재', hr: '인사', accounting: '회계',
}
export function categoryLabel(category: Category, kind: TeamKind = 'SALES') {
  return category === 'meeting' && kind !== 'SALES' ? '회의' : labels[category]
}
// 알림 시점과 시작일 기준 며칠 전인지. 90일 전은 3개월 뒤 견적 같은 장기 일정용입니다.
export const alertOffsets: Record<string, number> = { '90일 전': 90, '30일 전': 30, '7일 전': 7, '3일 전': 3, '1일 전': 1, '당일': 0 }
export const alertOptions = Object.keys(alertOffsets)

export const seoulDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}
export function shiftDate(value: string, days: number) {
  const date = new Date(value)
  date.setUTCDate(date.getUTCDate() + days)
  return dateKey(date)
}
// 캘린더 화면에 보이는 칸: 월 보기는 그 달 1일이 든 주 일요일부터 말일이 든 주 토요일까지, 주 보기는 일~토, 일 보기는 하루입니다.
export function calendarGrid(cursor: string, mode: 'month' | 'week' | 'day') {
  const [year, month] = cursor.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1, 1))
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstKey = mode === 'month' ? shiftDate(dateKey(first), -first.getUTCDay())
    : mode === 'week' ? shiftDate(cursor, -new Date(cursor).getUTCDay()) : cursor
  const count = mode === 'month' ? Math.ceil((length + first.getUTCDay()) / 7) * 7 : mode === 'week' ? 7 : 1
  return { year, month, first, firstKey, count, lastKey: shiftDate(firstKey, count - 1) }
}
// 캘린더의 이전(-1)·다음(1) 기간으로 옮긴 커서입니다. 월 보기는 그 달 1일, 주·일 보기는 7일·1일씩 옮깁니다.
export function calendarStep(cursor: string, mode: 'month' | 'week' | 'day', direction: number) {
  const { year, month, count } = calendarGrid(cursor, mode)
  return mode === 'month' ? dateKey(new Date(Date.UTC(year, month - 1 + direction, 1))) : shiftDate(cursor, direction * count)
}
export function overlaps(task: Task, start: string, end = start) {
  return task.start <= end && task.end >= start
}
export function overdueDays(task: Task, today = seoulDate()) {
  if (task.status === '완료') return 0
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(task.end)) / 86_400_000))
}

export function reminderDue(task: Task, today: string) {
  if (task.status === '완료' || task.end < today) return false
  return task.alerts.some(alert => {
    const trigger = shiftDate(task.start, -(alertOffsets[alert] ?? 0))
    const days = Math.round((Date.parse(today) - Date.parse(trigger)) / 86_400_000)
    return days === 0 || (days > 0 && (task.repeat === '매일' || (task.repeat === '매주' && days % 7 === 0)))
  })
}
