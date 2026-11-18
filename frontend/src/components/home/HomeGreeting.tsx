// 오늘의 기록 옆에 서울 기준 날짜를 표시합니다.
// Intl.DateTimeFormat은 이 날짜를 '11월 17일 화요일'처럼 사람이 읽기 쉬운 한국어 형식으로 바꿉니다.
import './HomeGreeting.css'
import { today } from '../../utils/date'

export default function HomeGreeting() {
  return (
    <header className="greeting">
      <h1>오늘의 기록</h1>
      <time dateTime={today}>
        {new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${today}T12:00:00`))}
      </time>
    </header>
  )
}
