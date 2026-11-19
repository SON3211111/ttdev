import { apiRequest } from './request'

// 서버 상태 값을 키로 사용하고 화면에는 각각의 한글 이름을 표시합니다.
export const taskStatuses = { TODO: '하기 전', DOING: '하는 중', DONE: '완료' } as const
export type TaskStatus = keyof typeof taskStatuses
export type TaskInput = { title: string; description: string | null; dueDate: string | null }
export type Task = TaskInput & { id: string; status: TaskStatus; completedAt: string | null; overdue: boolean }
export type CalendarTask = Pick<Task, 'id' | 'title' | 'status'> & { dueDate: string }
export type TaskPage = { items: Task[]; page: number; totalPages: number }
export type TaskEvent = { previousStatus: TaskStatus; nextStatus: TaskStatus; changedAt: string }
export type TaskDayCount = { date: string; count: number }
// 전체 상태 집계와 두 주간 차트의 날짜별 건수를 함께 받습니다.
export type Dashboard = {
  total: number; done: number; doing: number; overdue: number
  trend: TaskDayCount[]
  upcomingDue: TaskDayCount[]
}

const base = '/api/tasks'
export const tasksApi = {
  month: (month: string, signal?: AbortSignal) =>
    apiRequest<CalendarTask[]>(`/api/calendar/tasks?${new URLSearchParams({ month })}`, { signal }),
  save(input: TaskInput, id?: string) {
    return apiRequest<Task>(id ? `${base}/${id}` : base, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(input),
    })
  },
  status: (id: string, status: TaskStatus) => apiRequest<Task>(`${base}/${id}/status`, {
    method: 'PUT', body: JSON.stringify({ status }),
  }),
  delete: (id: string) => apiRequest<void>(`${base}/${id}`, { method: 'DELETE' }),
}

export function taskError(error: unknown) {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'
}
