export type ScheduleStatus = 'PLANNED' | 'COMPLETED' | 'CANCELLED'
export type ScheduleInput = { title: string; scheduleDate: string; scheduleTime: string | null; location: string | null; description: string | null }
export type Schedule = ScheduleInput & { id: string; status: ScheduleStatus; createdAt: string; updatedAt: string }
export type SchedulePage = { items: Schedule[]; page: number; size: number; totalElements: number; totalPages: number }
export const statusLabels: Record<ScheduleStatus, string> = { PLANNED: '예정', COMPLETED: '완료', CANCELLED: '취소' }
