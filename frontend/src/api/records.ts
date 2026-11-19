import { apiRequest } from './request'
/**
 * 화면에서 백엔드의 기록 API를 부를 때 사용하는 함수 모음입니다.
 * API는 서버에 데이터를 요청하는 주소/방법이고, fetch가 실제 HTTP 요청을 보냅니다.
 * 성공하면 서버 데이터를 돌려주고, 실패하면 Error를 던져 화면의 catch가 안내하게 합니다.
 * 여기서는 입력창을 비우지 않습니다. 저장에 성공했는지는 QuickMemo가 확인해서 처리합니다.
 * 응답 모양은 types/record.ts, 요청 규칙은 docs/MINIMUM_DESIGN.md에서 함께 볼 수 있습니다.
 */
import type { RecordDetail, RecordFilter, RecordPage } from '../types/record'

// T는 응답 데이터의 타입입니다. 예: request<RecordDetail>은 기록 상세를 돌려준다는 뜻입니다.
// options에는 method(요청 방법), body(보낼 데이터), signal(취소 신호) 등을 넣습니다.
function request<T>(path: string, options: RequestInit = {}) { return apiRequest<T>(`/api/records${path}`, options) }

// 기록 CRUD와 통합 캘린더의 월간 기록 조회를 연결합니다.
export const recordsApi = {
  async month(month: string, signal?: AbortSignal) {
    const [year, number] = month.split('-').map(Number)
    const end = new Date(Date.UTC(year, number, 0)).getUTCDate()
    const items: RecordPage['items'] = []
    // 서버는 한 번에 최대 100개만 줍니다. totalPages만큼 반복 조회해서 월 전체 기록을 모읍니다.
    // Date.UTC(year, number, 0)은 요청한 달의 마지막 날을 계산합니다. 예: 2020년 2월은 29일입니다.
    for (let page = 0; ; page++) {
      const params = new URLSearchParams({ start: `${month}-01`, end: `${month}-${end}`, page: String(page), size: '100' })
      const result = await request<RecordPage>(`?${params}`, { signal })
      items.push(...result.items)
      if (page + 1 >= result.totalPages) return items
    }
  },
  // 홈의 최근 기록은 한 페이지에 5개입니다. '전체'일 때는 type 조건을 보내지 않습니다.
  list(filter: RecordFilter, page: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(page), size: '5' })
    if (filter !== '전체') params.set('type', filter === '메모' ? 'MEMO' : 'DIARY')
    return request<RecordPage>(`?${params}`, { signal })
  },
  // GET=조회, POST=등록, PUT=전체 수정, DELETE=삭제입니다.
  // encodeURIComponent는 ID가 주소에 안전하게 들어가게 하고, JSON.stringify는 객체를 전송용 문자열로 바꿉니다.
  detail: (id: string, signal?: AbortSignal) => request<RecordDetail>(`/${encodeURIComponent(id)}`, { signal }),
  create: (content: string, recordDate: string) => request<RecordDetail>('', {
    method: 'POST', body: JSON.stringify({ recordType: 'MEMO', content, recordDate }),
  }),
  createDiary: (title: string, content: string, recordDate: string) => request<RecordDetail>('', { method: 'POST', body: JSON.stringify({ recordType: 'DIARY', title, content, recordDate }) }),
  update: (id: string, content: string, recordDate: string, title?: string) => request<RecordDetail>(`/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify({ content, recordDate, title }),
  }),
  delete: (id: string) => request<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
