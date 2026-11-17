// 홈의 인사말과 날짜를 보여줍니다. utils/date.ts의 today는 한국 기준 'YYYY-MM-DD' 문자열입니다.
// Intl.DateTimeFormat은 이 날짜를 '11월 17일 화요일'처럼 사람이 읽기 쉬운 한국어 형식으로 바꿉니다.
import './HomeGreeting.css'
import { today } from '../../utils/date'

export default function HomeGreeting() {
  return (
    <section className="greeting"><div><p className="eyebrow">YOUR EVERYDAY, REMEMBERED</p><h1>오늘의 작은 순간을 남겨볼까요?</h1><p className="subtitle">짧게 남겨도, 오래 기억할 수 있도록.</p></div><div className="today"><span>오늘</span><strong>{new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long'}).format(new Date(`${today}T12:00:00`))}</strong></div></section>
  )
}
