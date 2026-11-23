import { ArrowRight, CalendarDays, FileCheck2, LayoutGrid, ShieldCheck } from 'lucide-react'
import type { View } from './smartwork-data'

export default function PortalHome({ navigate, openWorkspace, name, taskCount }: { navigate: (view: View) => void; openWorkspace: () => void; name?: string; taskCount?: number }) {
  const cards = [
    { title: '영업 캘린더 & 일정', text: taskCount === undefined ? '외근 일정과 고객사 미팅을 확인하세요.' : `오늘의 일정 ${taskCount}건 · 외근 및 고객사 미팅 조회`, label: '캘린더 바로가기', icon: CalendarDays, open: () => navigate('calendar') },
    { title: '팀 워크스페이스', text: '영업 1팀 협업 공간 바로가기 · 프로젝트 자료실 및 고객사 정보', label: '팀 공간 입장', icon: LayoutGrid, open: openWorkspace },
    { title: '회의 및 업무보고', text: '일일·주간 회의록과 팀 업무보고를 작성하고 공유하세요.', label: '보고서 열기', icon: FileCheck2, open: () => navigate('reports') },
  ]
  return <main className="sw-portal">
    <section className="sw-hero">
      <div className="sw-hero-decoration" aria-hidden="true"><CalendarDays size={180} strokeWidth={.8} /></div>
      <p className="sw-hero-tag"><ShieldCheck size={15} />(주)티앤테크 통합 스마트워크 스케줄러</p>
      <h1>{name ? `안녕하세요, ${name} 님.` : '사내 업무 공간'}<br />오늘도 안전하고 효율적인 하루 되세요.</h1>
      <p className="sw-hero-copy">영업 일정, NIFS 스마트팩토리 프로젝트 및 사내 업무보고를 신속하게 확인하고 관리하세요.</p>
      <div className="sw-buttons"><button className="sw-primary" type="button" onClick={() => navigate('calendar')}><CalendarDays size={17} />영업 캘린더 열기</button>
        <button className="sw-secondary" type="button" onClick={openWorkspace}>워크스페이스 선택<ArrowRight size={16} /></button></div>
    </section>
    <section className="sw-quick" aria-label="업무 바로가기">{cards.map(({ title, text, label, icon: Icon, open }) =>
      <article className="sw-card sw-quick-card" key={title}><span className="sw-quick-icon"><Icon size={26} /></span><h2>{title}</h2><p>{text}</p>
        <button type="button" onClick={open}>{label}<ArrowRight size={16} /></button></article>
    )}</section>
  </main>
}
