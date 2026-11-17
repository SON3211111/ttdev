/**
 * 월간 달력과 선택한 날짜의 메모 목록을 보여줍니다. 실제 본문은 기록 상세에서 읽습니다.
 * month는 보고 있는 월('2026-11'), selectedDate는 클릭한 날짜('2026-11-17')입니다.
 * 부모가 revision을 올리면 현재 월을 다시 읽고, savedDate를 보내면 저장한 날짜로 이동합니다.
 */
import { useEffect, useState } from 'react'
import { recordsApi } from '../../api/records'
import type { RecordSummary } from '../../types/record'
import { today } from '../../utils/date'
import './RecordCalendar.css'

type Props = { revision: number; savedDate: { date: string } | null; onSelect: (id: string) => void }

export default function RecordCalendar({ revision, savedDate, onSelect }: Props) {
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(today)
  const [result, setResult] = useState<{ key: string; items: RecordSummary[]; error: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const [previousSavedDate, setPreviousSavedDate] = useState(savedDate)

  // 부모가 새 savedDate 객체를 보냈는지 이전 값과 비교합니다. 같을 때는 상태를 바꾸지 않아 반복을 막습니다.
  // 값이 다르면 React가 이 컴포넌트를 다시 그립니다. 새 월이 결정된 뒤 effect가 조회를 시작합니다.
  if (savedDate !== previousSavedDate) {
    setPreviousSavedDate(savedDate)
    if (savedDate) { setMonth(savedDate.date.slice(0, 7)); setSelectedDate(savedDate.date) }
  }
  // 조회에 '월:부모 갱신 횟수:재시도 횟수' 이름표를 붙입니다.
  // 이름표가 달라지면 이전 월의 개수/목록은 숨기고 새 응답이 올 때까지 로딩을 표시합니다.
  const queryKey = `${month}:${revision}:${retry}`
  const current = result?.key === queryKey ? result : null
  const loading = current === null
  const items = current?.items ?? []
  const error = current?.error ?? ''

  useEffect(() => {
    // 월 이동 도중 이전 조회가 늦게 끝나도 현재 달력을 덮어쓰지 않도록 취소 신호를 함께 보냅니다.
    const controller = new AbortController()
    recordsApi.month(month, controller.signal).then(result => {
      if (!controller.signal.aborted) setResult({ key: queryKey, items: result, error: '' })
    }).catch(reason => {
      if (!controller.signal.aborted) setResult({ key: queryKey, items: [], error: reason instanceof Error ? reason.message : '기록을 불러오지 못했습니다.' })
    })
    return () => controller.abort()
  }, [month, queryKey])

  // getUTCDay(): 1일의 요일(일=0~토=6). 그 수만큼 빈칸을 넣어 달력의 시작 위치를 맞춥니다.
  // Date.UTC의 월은 0부터 시작하며, 다음 달의 0일은 이번 달의 마지막 날입니다.
  const [year, number] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, number - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const dates = items.filter(item => item.recordDate === selectedDate)
  function move(offset: number) {
    // offset=-1은 이전 달, +1은 다음 달입니다. Date가 12월↔1월의 연도 변경도 계산합니다.
    const date = new Date(Date.UTC(year, number - 1 + offset, 1))
    const next = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    setMonth(next); setSelectedDate(`${next}-01`)
  }

  // aria-*는 화면 읽기 프로그램에 선택 날짜와 로딩 상태를 알려주는 속성입니다.
  return <section className="record-calendar" id="calendar" aria-labelledby="calendar-title" aria-busy={loading}>
    <div className="calendar-heading"><h2 id="calendar-title">Calendar</h2><button onClick={() => { setMonth(today.slice(0, 7)); setSelectedDate(today) }}>오늘</button></div>
    <p className="calendar-description">저장한 메모를 기록 날짜별로 모아보세요.</p>
    <nav className="calendar-month" aria-label="캘린더 월 이동">
      <button aria-label="이전 달" disabled={month === '1000-01'} onClick={() => move(-1)}>‹</button>
      <strong>{year}년 {number}월</strong>
      <button aria-label="다음 달" disabled={month === '9999-12'} onClick={() => move(1)}>›</button>
    </nav>
    {loading && <p role="status">캘린더를 불러오는 중입니다…</p>}
    {error && <p role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>다시 조회</button></p>}
    <div className="calendar-days">
      {['일', '월', '화', '수', '목', '금', '토'].map(label => <span className="weekday" key={label}>{label}</span>)}
      {Array.from({ length: first }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length: days }, (_, index) => {
        const date = `${month}-${String(index + 1).padStart(2, '0')}`
        const count = items.filter(item => item.recordDate === date).length
        return <button key={date} className={selectedDate === date ? 'chosen' : ''}
          aria-pressed={selectedDate === date} aria-current={date === today ? 'date' : undefined}
          aria-label={`${date}, ${loading || error ? '기록 확인 중' : `기록 ${count}개`}`} onClick={() => setSelectedDate(date)}>
          <span>{index + 1}</span><small>{count > 0 ? `${count}개` : '\u00a0'}</small>
        </button>
      })}
    </div>
    <div className="calendar-records"><h3>{selectedDate.replaceAll('-', '. ')} 기록</h3>
      {!loading && !error && dates.length === 0 && <p>이 날짜에는 저장된 기록이 없어요.</p>}
      {!loading && !error && dates.map(item => <button key={item.id} onClick={() => onSelect(item.id)}>
        <span>{item.recordType === 'MEMO' ? '메모' : '일기'}</span><span>{item.title || item.preview}</span><span aria-hidden="true">↗</span>
      </button>)}
    </div>
  </section>
}
