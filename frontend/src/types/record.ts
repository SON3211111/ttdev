// TypeScript 타입은 값의 모양을 검사하기 위한 설계도입니다. 실제 서버 응답 내용까지 검사해 주지는 않습니다.
// RecordEntry는 초기 디자인 예시용이고, 실제 API는 RecordSummary/RecordDetail/RecordPage를 사용합니다.
// Summary는 짧은 미리보기, Detail은 전체 본문, Page는 목록과 페이지 정보를 담습니다.
export type RecordType = '메모' | '일기'
export type RecordFilter = '전체' | RecordType
export type RecordEntry = {
  id: number
  type: RecordType
  date: string
  title: string
  content: string
}

export type RecordSummary = {
  id: string
  recordType: 'MEMO' | 'DIARY'
  title: string | null
  preview: string
  recordDate: string
  contentVersion: number
  embeddingStatus: 'PENDING' | 'COMPLETED' | 'FAILED'
  indexedVersion: number | null
  createdAt: string
  updatedAt: string
}
// Omit은 기존 타입에서 필드를 빼는 문법입니다. 목록의 preview를 빼고 상세의 content를 추가합니다.
// 상세 응답에는 목록의 미리보기 대신 전체 본문이 들어갑니다.
export type RecordDetail = Omit<RecordSummary, 'preview'> & { content: string }
export type RecordPage = {
  items: RecordSummary[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}
