// 홈 맨 아래 안내와 AI 테스트 버튼입니다. 버튼은 부모가 준 onOpenAiTest를 호출할 뿐입니다.
// 실제 화면 전환은 App.tsx의 page 상태를 바꾸면서 이루어집니다.
import './SiteFooter.css'
type Props = { onOpenAiTest: () => void }

// 화면 하단의 공통 푸터입니다.
export default function SiteFooter(props: Props) {
  return (
    <footer className="site-footer"><span>나의 하루</span><p>평범한 하루에도, 기억할 순간은 있으니까.</p><button onClick={props.onOpenAiTest}>AI 연결 테스트 ↗</button></footer>
  )
}
