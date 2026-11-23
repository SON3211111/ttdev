import type { TeamKind } from '../api/team'

// 팀 유형별 업무 구분. meeting은 영업형에서 '업무협의', 다른 유형에서 '회의'로 표시합니다.
export type Category = 'estimate' | 'meeting' | 'delivery' | 'etc' | 'develop' | 'test' | 'field' | 'purchase' | 'approval' | 'hr' | 'accounting'
export type WorkStatus = '대기' | '진행 중' | '완료'
export type Task = {
  id: string; category: Category; company: string; start: string; end: string; notes: string
  alerts: string[]; repeat: string; status: WorkStatus; time?: string; title?: string
  assigneeId?: number; assigneeName?: string; completedDate?: string
  sourceQuoteId?: number
}
export type View = 'portal' | 'calendar' | 'clients' | 'reports' | 'settings' | 'today' | 'notifications' | 'overdue' | 'completed' | 'workspace'
export const smartViews = new Set<string>(['portal', 'calendar', 'clients', 'reports', 'settings', 'today', 'notifications', 'overdue', 'completed', 'workspace'])
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
