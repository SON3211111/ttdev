// 화면 위쪽 메뉴입니다. 화면 전환과 스크롤은 부모에서 처리합니다.
import type { MouseEvent } from 'react'
import './SiteHeader.css'

type Props = {
  onNavigate: () => void
  onOpenTasks?: () => void
  onHomeSection?: (section: string) => void
  tasksActive?: boolean
  recordsActive?: boolean
  busy?: boolean
}

export default function SiteHeader({ onNavigate, onOpenTasks, onHomeSection, tasksActive, recordsActive, busy }: Props) {
  const homeActive = !tasksActive && !recordsActive
  function navigateHome(event: MouseEvent<HTMLAnchorElement>, section: string) {
    if (!onHomeSection) return
    event.preventDefault()
    if (!busy) onHomeSection(section)
  }
  return (
    <header className="site-header">
      <a href="#home" className="brand" onClick={event => navigateHome(event, 'home')}>
        <span className="brand-mark">m</span>memoria<span className="dot">.</span>
      </a>
      <nav aria-label="주 메뉴">
        <a className={homeActive ? 'active' : undefined} href="#home" aria-current={homeActive ? 'page' : undefined}
          onClick={event => navigateHome(event, 'home')}>홈</a>
        <a className={recordsActive ? 'active' : undefined} aria-current={recordsActive ? 'page' : undefined}
          href="#records" onClick={event => navigateHome(event, 'records')}>기록</a>
        <a href="#calendar" onClick={event => navigateHome(event, 'calendar')}>캘린더</a>
        <button className={tasksActive ? 'active' : undefined} aria-current={tasksActive ? 'page' : undefined} aria-disabled={tasksActive || undefined}
          onClick={onOpenTasks}>일정 관리</button>
        <button disabled={busy} onClick={onNavigate}>물어보기</button>
      </nav>
      <span className="personal">나만의 기억 공간</span>
    </header>
  )
}
