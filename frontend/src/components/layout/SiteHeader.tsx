// 화면 위쪽 메뉴입니다. href="#records"는 새 페이지가 아니라 현재 페이지의 id="records" 위치로 이동합니다.
// 기억 찾기는 아직 미구현이므로 부모가 전달한 onNavigate 함수를 호출해 안내를 보여줍니다.
import './SiteHeader.css'
type Props = { onNavigate: (name: string) => void }

export default function SiteHeader(props: Props) {
  return (
    <header className="site-header"><a href="#home" className="brand"><span className="brand-mark">m</span>memoria<span className="dot">.</span></a><nav aria-label="주 메뉴"><a className="active" href="#home" aria-current="page">홈</a><a href="#records">기록</a><a href="#calendar">캘린더</a><button onClick={()=>props.onNavigate('AI 기억 찾기')}>기억 찾기 <span>✧</span></button></nav><span className="personal">나만의 기억 공간</span></header>
  )
}
