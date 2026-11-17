/**
 * 홈 화면을 조립하고, 최근 기록과 선택한 기록을 관리하는 파일입니다.
 * 입력창 자체는 QuickMemo, 상세와 수정 폼은 RecordDetail에서 관리합니다.
 * 메모 저장 순서: QuickMemo의 저장 버튼 → addMemo → recordsApi → 백엔드 → MySQL.
 * 저장이 끝나면 최근 기록과 캘린더를 각각 다시 읽습니다. 목록을 읽는 데 실패해도
 * 이미 저장한 메모는 DB에 있으므로, 저장을 다시 요청하지 않고 조회만 재시도합니다.
 */
import { useEffect, useState } from 'react'
import SiteHeader from '../components/layout/SiteHeader'
import SiteFooter from '../components/layout/SiteFooter'
import HomeGreeting from '../components/home/HomeGreeting'
import DiaryForm from '../components/home/DiaryForm'
import QuickMemo from '../components/home/QuickMemo'
import UpcomingSchedules from '../components/home/UpcomingSchedules'
import RecentRecords from '../components/home/RecentRecords'
import RecordDetail from '../components/home/RecordDetail'
import RecordCalendar from '../components/home/RecordCalendar'
import MemoryGuide from '../components/home/MemoryGuide'
import { recordsApi } from '../api/records'
import type { RecordFilter, RecordPage } from '../types/record'
import './HomePage.css'

type Props = { onOpenAiTest: () => void }

export default function HomePage({ onOpenAiTest }: Props) {
  // useState는 화면이 기억할 값입니다. set으로 시작하는 함수를 호출하면 값이 바뀌고 화면도 다시 그려집니다.
  // page는 0부터 시작합니다. revision은 재조회가 필요할 때 올리는 숫자이며 기록의 버전 번호가 아닙니다.
  const [writingDiary, setWritingDiary] = useState(false)
  const [filter, setFilter] = useState<RecordFilter>('전체')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; data: RecordPage | null; error: string } | null>(null)
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  // 날짜를 객체로 담으면 같은 날짜에 메모를 연속 저장해도 캘린더가 새 저장을 알아볼 수 있습니다.
  const [savedDate, setSavedDate] = useState<{ date: string } | null>(null)
  // 예: '메모:0:2'는 메모 필터, 첫 페이지, 두 번째 갱신을 뜻합니다.
  // 응답에 이 이름표(key)를 붙여 현재 조건과 다르면 숨깁니다. 그러면 일기 탭에 메모가 잠깐 보이지 않습니다.
  const queryKey = `${filter}:${page}:${revision}`
  const current = result?.key === queryKey ? result : null
  const loading = current === null
  const data = current?.data ?? null
  const error = current?.error ?? ''

  // useEffect는 아래 의존 값(filter/page/queryKey)이 바뀌거나 화면이 처음 열릴 때 조회를 시작합니다.
  // 필터를 빠르게 바꾸면 먼저 보낸 요청이 더 늦게 끝날 수 있습니다.
  // AbortController로 이전 요청을 취소하고, 응답이 와도 취소된 요청이면 화면에 반영하지 않습니다.
  useEffect(() => {
    const controller = new AbortController()
    recordsApi.list(filter, page, controller.signal).then(result => {
      if (controller.signal.aborted) return
      // 예: 2페이지의 마지막 메모를 삭제했다면 빈 2페이지 대신 1페이지를 다시 조회합니다.
      if (result.items.length === 0 && page > 0) { setPage(page - 1); return }
      setResult({ key: queryKey, data: result, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ key: queryKey, data: null, error: error instanceof Error ? error.message : '기록을 불러오지 못했습니다.' })
    })
    // 다음 조회를 시작하거나 홈 화면을 떠날 때 React가 이 정리 함수를 실행합니다.
    return () => controller.abort()
  }, [filter, page, queryKey])

  // revision을 1 올리면 queryKey가 달라져 위 useEffect와 캘린더 조회가 다시 실행됩니다.
  // message가 있으면 화면에 성공 안내도 표시합니다.
  function refresh(message?: string) {
    if (message) setNotice(message)
    setRevision(value => value + 1)
  }

  async function addMemo(content: string, date: string) {
    // await는 서버의 저장 응답을 기다립니다. 실패하면 아래 줄로 가지 않고 QuickMemo의 catch로 전달됩니다.
    // 성공하면 저장 날짜로 캘린더를 이동하고, 최근 기록은 전체 필터의 첫 페이지부터 다시 읽습니다.
    await recordsApi.create(content, date)
    setSavedDate({ date })
    setFilter('전체')
    setPage(0)
    refresh('메모를 저장했습니다. 최근 기록과 캘린더에 반영합니다.')
  }

  // 아직 구현하지 않은 메뉴는 데이터 작업 대신 안내만 보여줍니다.
  function showPending(name: string) { setNotice(name + ' 화면은 다음 단계에서 연결할 예정입니다.') }

  return (
    <div className="shell">
      <SiteHeader onNavigate={showPending} />
      <main id="home" className="home-main">
        <HomeGreeting />
        <div className="preview"><i />메모·일기·일정은 실제로 저장됩니다<span>AI 검색과 약속 준비는 아직 연결 전입니다.</span></div>
        <p className="notice" role="status">{notice}</p>
        <div className="grid">
          <div className="home-primary">
            <div hidden={writingDiary}><QuickMemo onSave={addMemo} onWriteDiary={() => setWritingDiary(true)} /></div>
            {writingDiary && <DiaryForm onClose={() => setWritingDiary(false)} onSaved={date => {
              setWritingDiary(false); setSavedDate({ date }); setFilter('전체'); setPage(0); refresh('일기를 저장했습니다. 목록과 캘린더에 반영합니다.')
            }} />}
            <RecordCalendar revision={revision} savedDate={savedDate} onSelect={id => {
              setSelected(id)
              document.getElementById('records')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }} />
          </div>
          <aside className="home-sidebar" aria-label="최근 기록과 일정, 기억 찾기">
            <div className="records-area">
              <RecentRecords data={data} loading={loading} error={error} filter={filter}
                onFilterChange={value => { setFilter(value); setPage(0) }}
                onReload={() => refresh()} onPageChange={setPage} onSelect={setSelected} />
              {selected && <RecordDetail key={selected} id={selected} onClose={() => setSelected(null)} onChanged={refresh} />}
            </div>
            <UpcomingSchedules />
            <MemoryGuide />
          </aside>
        </div>
        <SiteFooter onOpenAiTest={onOpenAiTest} />
      </main>
    </div>
  )
}
