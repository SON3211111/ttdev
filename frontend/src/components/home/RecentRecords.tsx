// 부모 HomePage가 읽어온 최근 기록을 그리는 화면입니다. 이 파일은 직접 API를 호출하지 않습니다.
// props는 부모가 전달한 값/함수입니다. 필터나 페이지 버튼을 누르면 부모 함수가 조건을 바꾸고 다시 조회합니다.
// 목록에는 짧은 preview만 있고, 기록 버튼을 누르면 상세 화면이 전체 본문을 따로 읽습니다.
import type { RecordFilter, RecordPage } from '../../types/record'
import './RecentRecords.css'

const filters: RecordFilter[] = ['전체', '메모', '일기']
type Props = {
  data: RecordPage | null
  loading: boolean
  error: string
  filter: RecordFilter
  onFilterChange: (filter: RecordFilter) => void
  onReload: () => void
  onPageChange: (page: number) => void
  onSelect: (id: string) => void
}

export default function RecentRecords(props: Props) {
  const { data, loading, error, filter } = props
  return (
    <section className="records" id="records" aria-labelledby="records-title" aria-busy={loading}>
      <div className="section-head">
        <h2 id="records-title">전체 기록 <span className="count">{data?.totalElements ?? '—'}</span></h2>
        <span className="muted">기록 날짜 최신순</span>
      </div>
      <div className="tabs" aria-label="기록 종류 필터">
        {filters.map(type => <button key={type} aria-pressed={filter === type}
          className={filter === type ? 'selected' : ''} onClick={() => props.onFilterChange(type)}>{type}</button>)}
        <button className="reload" onClick={props.onReload} disabled={loading}>새로고침</button>
      </div>
      {loading && <p className="empty-state" role="status">기록을 불러오는 중입니다…</p>}
      {error && <div className="list-error" role="alert"><p>{error}</p><button onClick={props.onReload}>다시 조회</button></div>}
      {!loading && !error && data?.items.length === 0 && <p className="empty-state">아직 기록이 없어요. 새 기록을 남겨보세요.</p>}
      {!loading && !error && data?.items.map(entry => (
        <div className="record" key={entry.id}>
          <button className="record-select" onClick={() => props.onSelect(entry.id)} aria-label={(entry.recordType === 'MEMO' ? '메모' : '일기') + ' 상세 보기: ' + (entry.title || entry.preview)}>
            <span className={'record-icon ' + (entry.recordType === 'DIARY' ? 'diary' : '')} aria-hidden="true">{entry.recordType === 'DIARY' ? '▤' : '≡'}</span>
            <div className="record-copy">
              <div className="meta"><span>{entry.recordType === 'MEMO' ? '메모' : '일기'}</span><time dateTime={entry.recordDate}>{entry.recordDate.replaceAll('-', '. ')}</time></div>
              <h3>{entry.title || entry.preview}</h3>
              <p>{entry.preview}</p>
            </div>
            <span className="arrow" aria-hidden="true">↗</span>
          </button>
        </div>
      ))}
      {!loading && !error && data && data.totalPages > 1 && <nav className="pagination" aria-label="기록 페이지">
        <button disabled={data.page === 0} onClick={() => props.onPageChange(data.page - 1)}>이전</button>
        <span>{data.page + 1} / {data.totalPages}</span>
        <button disabled={data.page + 1 >= data.totalPages} onClick={() => props.onPageChange(data.page + 1)}>다음</button>
      </nav>}
    </section>
  )
}
