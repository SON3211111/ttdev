import { useState } from 'react'
import './TeamLanding.css'

const days = ['월 16', '화 17', '수 18', '목 19', '금 20']
const today = 18

const sampleWork = [
  { id: 'quote', type: '견적', title: '장비 견적 검토', person: '김민수', start: 16, end: 18, color: 'quote', status: '진행 중', note: '업체별 견적을 비교하고 구매팀에 검토 의견을 공유합니다.' },
  { id: 'meeting', type: '업무협의', title: '고객사 일정 협의', person: '이지은', start: 17, end: 18, color: 'meeting', status: '대기', note: '고객사와 설치 가능한 날짜를 조율합니다.' },
  { id: 'delivery', type: '납품', title: '현장 장비 납품', person: '박서준', start: 19, end: 20, color: 'delivery', status: '대기', note: '출고 목록을 확인하고 현장 담당자에게 인계합니다.' },
  { id: 'stock', type: '기타', title: '출고 재고 확인', person: '김민수', start: 16, end: 17, color: 'other', status: '진행 중', note: '예정 수량과 실제 출고 가능한 수량을 대조합니다.' },
  { id: 'documents', type: '납품', title: '납품 확인서 정리', person: '이지은', start: 16, end: 16, color: 'delivery', status: '완료', note: '납품 확인서를 정리하고 팀에 공유했습니다.' },
]

type Work = typeof sampleWork[number]

const isOverdue = (work: Work) => work.end < today && work.status !== '완료'
const filters = [
  { label: '오늘 업무', matches: (work: Work) => work.start <= today && work.end >= today && work.status !== '완료' },
  { label: '기한 초과', matches: isOverdue },
  { label: '이번 주 예정', matches: (work: Work) => work.end >= today && work.status !== '완료' },
  { label: '이번 주 완료', matches: (work: Work) => work.status === '완료' },
]

export default function TeamLanding() {
  const [activeFilter, setActiveFilter] = useState(0)
  const [selected, setSelected] = useState(sampleWork[0])
  const filtered = sampleWork.filter(filters[activeFilter].matches)
  const overdue = isOverdue(selected)

  function selectFilter(index: number) {
    setActiveFilter(index)
    const first = sampleWork.find(filters[index].matches)
    if (first) setSelected(first)
  }

  return (
    <div className="team-landing">
      <header className="team-landing-header">
        <span className="team-brand"><span className="team-brand-mark" aria-hidden="true" />t&amp;tech</span>
        <span className="team-header-caption">예시 데이터</span>
      </header>
      <main className="team-overview">
        <div className="team-overview-heading">
          <h1>업무 대시보드</h1>
          <time dateTime="2026-11-18">2026년 11월 18일 수요일</time>
        </div>
        <div className="team-metrics" aria-label="업무 목록 필터">
          {filters.map((filter, index) => (
            <button key={filter.label} type="button" onClick={() => selectFilter(index)} aria-pressed={index === activeFilter}>
              <span>{filter.label}</span>
              <strong>{sampleWork.filter(filter.matches).length}<small>건</small></strong>
            </button>
          ))}
        </div>
        <div className="team-workspace">
          <section className="team-panel" aria-labelledby="team-preview-title">
            <header className="team-panel-heading">
              <h2 id="team-preview-title">팀 일정</h2>
              <span>11월 16일 – 20일</span>
            </header>
            <div className="team-preview-grid">
              {days.map((day, index) => (
                <span key={day} className="team-preview-day" aria-current={index === 2 ? 'date' : undefined}>{day}</span>
              ))}
              {sampleWork.map((item, index) => (
                <button key={item.id} type="button"
                  className={`team-work-bar team-work-${item.color}`}
                  style={{ gridColumn: `${item.start - 15} / span ${item.end - item.start + 1}`, gridRow: index + 2 }}
                  aria-pressed={selected.id === item.id}
                  onClick={() => setSelected(item)}
                >
                  <strong>{item.title}</strong><span>{item.person}</span>
                </button>
              ))}
            </div>
          </section>
          <aside className="team-panel team-work-panel">
            <section aria-labelledby="team-list-title">
              <header className="team-panel-heading"><h2 id="team-list-title">{filters[activeFilter].label}</h2></header>
              <ul className="team-work-list">
                {filtered.map(item => (
                  <li key={item.id}>
                    <button type="button" onClick={() => setSelected(item)} aria-pressed={selected.id === item.id}>
                      <strong>{item.title}</strong><span>{item.person} · {item.end}일 마감</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <article className="team-preview-detail" aria-live="polite" aria-atomic="true">
              <p className="team-detail-type">{selected.type} <span className={overdue ? 'team-overdue' : undefined}>{overdue ? '기한 초과' : selected.status}</span></p>
              <h3>{selected.title}</h3>
              <p>{selected.person} · 11월 {selected.start === selected.end ? selected.end + '일' : selected.start + '일 – ' + selected.end + '일'}</p>
              <p>{selected.note}</p>
            </article>
          </aside>
        </div>
      </main>
    </div>
  )
}
