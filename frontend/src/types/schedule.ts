// 약속의 상태와 API 응답 형태입니다. 캘린더는 날짜 칸과 팝업에 필요한 필드만 받습니다.
export type ScheduleStatus = 'PLANNED' | 'COMPLETED' | 'CANCELLED'
export type ScheduleInput = { title: string; scheduleDate: string; scheduleTime: string | null; location: string | null; description: string | null }
export type Schedule = ScheduleInput & { id: string; status: ScheduleStatus; createdAt: string; updatedAt: string }
export type CalendarSchedule = Pick<Schedule, 'id' | 'title' | 'scheduleDate' | 'scheduleTime' | 'status'>
export type SchedulePage = { items: Schedule[]; page: number; size: number; totalElements: number; totalPages: number }
export const statusLabels: Record<ScheduleStatus, string> = { PLANNED: '예정', COMPLETED: '완료', CANCELLED: '취소' }
