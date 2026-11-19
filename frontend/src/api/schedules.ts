import { apiRequest } from './request'
import type { CalendarSchedule, Schedule, ScheduleInput, SchedulePage, ScheduleStatus } from '../types/schedule'
// 홈의 예정 약속은 페이지 단위로, 캘린더의 약속은 월 단위로 조회합니다.
export const schedulesApi = {
  month: (month: string, signal?: AbortSignal) =>
    apiRequest<CalendarSchedule[]>(`/api/calendar/schedules?${new URLSearchParams({ month })}`, { signal }),
  list(page: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(page), size: '20' })
    return apiRequest<SchedulePage>(`/api/schedules?${params}`, { signal })
  },
  detail: (id: string, signal?: AbortSignal) => apiRequest<Schedule>(`/api/schedules/${encodeURIComponent(id)}`, { signal }),
  create: (input: ScheduleInput) => apiRequest<Schedule>('/api/schedules', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ScheduleInput & {status: ScheduleStatus}) => apiRequest<Schedule>(`/api/schedules/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),
  delete: (id: string) => apiRequest<void>(`/api/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
