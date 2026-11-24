import { useEffect, useRef, useState } from 'react'
import { Bell, Box, ChevronDown, ChevronRight, Menu, Search } from 'lucide-react'
import { CategoryBadge } from './SharedBadges'
import type { Task, View } from './smartwork-data'
import { titleLabel, type TeamUser } from '../api/team'

export function Brand({ short = false }: { short?: boolean }) {
  return <span className="sw-brand"><span className="sw-brand-mark"><Box size={22} aria-hidden="true" /></span>
    <span><strong>{short ? 'T&T SALES SCHEDULE' : '(주)티앤테크'}</strong><small>{short ? '업무 스케줄 관리' : '스마트워크 포털'}</small></span>
  </span>
}

// 알림 버튼: 누르면 오늘 울린 알림 업무를 아래로 펼쳐 보여주고, 항목을 누르면 그 업무 상세를 엽니다. 바깥을 누르거나 Esc로 닫습니다.
function AlertMenu({ alerts, openTask, showAll, current }: { alerts: Task[]; openTask: (task: Task) => void; showAll: () => void; current: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const pick = (action: () => void) => { setOpen(false); action() }
  return <div className="sw-alert-menu" ref={ref}>
    <button className="sw-icon-button sw-bell" type="button" aria-label={`알림 ${alerts.length}건`} aria-expanded={open} aria-current={current ? 'page' : undefined} onClick={() => setOpen(value => !value)}>
      <Bell size={20} />{alerts.length > 0 && <b>{alerts.length}</b>}
    </button>
    {open && <div className="sw-alert-panel" role="dialog" aria-label="알림 목록">
      <header><strong>알림</strong><span>{alerts.length}건</span></header>
      {alerts.length === 0 ? <p className="sw-alert-empty">오늘 울린 알림이 없습니다.</p>
        : <ul>{alerts.map(task => <li key={task.id}><button type="button" onClick={() => pick(() => openTask(task))}>
          <CategoryBadge category={task.category} />
          <span><strong>{task.company || task.title}</strong>
            <small>{task.start === task.end ? task.start : task.start + ' ~ ' + task.end}{task.assigneeName ? ' · ' + task.assigneeName.replace(/\s*\(.*\)$/, '') : ''}</small>
            <small className="sw-alert-when">알림 {task.alerts.join(' · ')}</small></span>
        </button></li>)}</ul>}
      <footer><button type="button" onClick={() => pick(showAll)}>알림 전체 보기</button></footer>
    </div>}
  </div>
}

export default function TopHeader({ portal, view, navigate, openWorkspace, search, setSearch, alerts, openTask, onMenu, user, logout, spaceName }: {
  portal: boolean; view: View; navigate: (view: View) => void; openWorkspace: () => void
  search: string; setSearch: (value: string) => void; alerts: Task[]; openTask: (task: Task) => void; onMenu: () => void
  user?: TeamUser | null; logout: () => void; spaceName?: string
}) {
  return <header className={`sw-top ${portal ? 'sw-portal-top' : ''}`}>
    {portal ? <>
      <button className="sw-brand-button" type="button" onClick={() => navigate('portal')} aria-label="홈"><Brand /></button>
      {/* 캘린더·워크스페이스·회의·보고서는 아래 바로가기 카드와 겹쳐 상단 메뉴에서는 뺐습니다. */}
    </> : <>
      <button className="sw-icon-button sw-mobile-menu" type="button" aria-label="메뉴 열기" onClick={onMenu}><Menu size={20} /></button>
      {spaceName && <p className="sw-breadcrumb"><span>{spaceName}</span><ChevronRight size={14} aria-hidden="true" /><strong><i aria-hidden="true" />스케줄 관리</strong></p>}
      <form className="sw-search" onSubmit={event => { event.preventDefault(); navigate('calendar') }}>
        <Search size={17} aria-hidden="true" /><input aria-label="전역 업무 검색" placeholder="업체명, 업무 내용으로 검색…" value={search} onChange={event => setSearch(event.target.value)} />
      </form>
    </>}
    <div className="sw-top-actions">
      <AlertMenu alerts={alerts} openTask={openTask} showAll={() => navigate('notifications')} current={view === 'notifications'} />
      {user ? <details className="sw-profile">
        <summary aria-label={user.name + ' 프로필'}><span className="sw-avatar">{user.name[0]}</span><span><strong>{user.name}</strong><small>{user.membershipTeamId ? user.teamName : '회사'} · {titleLabel(user)}</small></span><ChevronDown size={14} /></summary>
        {/* 메뉴 항목을 고르면 드롭다운을 닫습니다. 같은 화면 틀 안에서 이동하면 열린 메뉴가 다음 화면을 가리기 때문입니다. */}
        <div onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}><button type="button" onClick={openWorkspace}>내 워크스페이스</button><button type="button" onClick={() => navigate('settings')}>설정</button><button type="button" onClick={logout}>로그아웃</button></div>
      </details> : <button type="button" className="sw-secondary" onClick={openWorkspace}>로그인</button>}
    </div>
  </header>
}
