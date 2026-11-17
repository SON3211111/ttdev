import { apiRequest } from './request'
import type { Schedule, ScheduleInput, SchedulePage, ScheduleStatus } from '../types/schedule'
export const schedulesApi = {
  list(start: string, end: string, status: ScheduleStatus | '', page: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ start, end, page: String(page), size: '20' })
    if (status) params.set('status', status)
    return apiRequest<SchedulePage>(`/api/schedules?${params}`, { signal })
  },
  detail: (id: string, signal?: AbortSignal) => apiRequest<Schedule>(`/api/schedules/${encodeURIComponent(id)}`, { signal }),
  create: (input: ScheduleInput) => apiRequest<Schedule>('/api/schedules', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: ScheduleInput & {status: ScheduleStatus}) => apiRequest<Schedule>(`/api/schedules/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),
  delete: (id: string) => apiRequest<void>(`/api/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
