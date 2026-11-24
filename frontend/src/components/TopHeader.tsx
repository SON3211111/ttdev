import { Bell, Box, ChevronDown, ChevronRight, Menu, Search } from 'lucide-react'
import type { View } from './smartwork-data'
import { titleLabel, type TeamUser } from '../api/team'

export function Brand({ short = false }: { short?: boolean }) {
  return <span className="sw-brand"><span className="sw-brand-mark"><Box size={22} aria-hidden="true" /></span>
    <span><strong>{short ? 'T&T SALES SCHEDULE' : '(주)티앤테크'}</strong><small>{short ? '영업팀 업무 스케줄 관리' : '스마트워크 포털'}</small></span>
  </span>
}

export default function TopHeader({ portal, view, navigate, openWorkspace, search, setSearch, count, onMenu, user, logout, spaceName }: {
  portal: boolean; view: View; navigate: (view: View) => void; openWorkspace: () => void
  search: string; setSearch: (value: string) => void; count: number; onMenu: () => void
  user?: TeamUser | null; logout: () => void; spaceName?: string
}) {
  return <header className={`sw-top ${portal ? 'sw-portal-top' : ''}`}>
    {portal ? <>
      <button className="sw-brand-button" type="button" onClick={() => navigate('portal')} aria-label="홈"><Brand /></button>
      <nav className="sw-gnb" aria-label="주 메뉴">
        <button aria-current="page" type="button" onClick={() => navigate('portal')}>홈</button>
        <button type="button" onClick={() => navigate('calendar')}>영업 캘린더</button>
        <button type="button" onClick={openWorkspace}>워크스페이스</button>
        <button type="button" onClick={() => navigate('reports')}>회의·보고서</button>
      </nav>
    </> : <>
      <button className="sw-icon-button sw-mobile-menu" type="button" aria-label="메뉴 열기" onClick={onMenu}><Menu size={20} /></button>
      {spaceName && <p className="sw-breadcrumb"><span>{spaceName}</span><ChevronRight size={14} aria-hidden="true" /><strong><i aria-hidden="true" />스케줄 관리</strong></p>}
      <form className="sw-search" onSubmit={event => { event.preventDefault(); navigate('calendar') }}>
        <Search size={17} aria-hidden="true" /><input aria-label="전역 업무 검색" placeholder="업체명, 업무 내용으로 검색…" value={search} onChange={event => setSearch(event.target.value)} />
      </form>
    </>}
    <div className="sw-top-actions">
      <button className="sw-icon-button sw-bell" type="button" aria-label={`알림 ${count}건`} aria-current={view === 'notifications' ? 'page' : undefined} onClick={() => navigate('notifications')}>
        <Bell size={20} />{count > 0 && <b>{count}</b>}
      </button>
      {user ? <details className="sw-profile">
        <summary aria-label={user.name + ' 프로필'}><span className="sw-avatar">{user.name[0]}</span><span><strong>{user.name}</strong><small>{user.membershipTeamId ? user.teamName : '회사'} · {titleLabel(user)}</small></span><ChevronDown size={14} /></summary>
        {/* 메뉴 항목을 고르면 드롭다운을 닫습니다. 같은 화면 틀 안에서 이동하면 열린 메뉴가 다음 화면을 가리기 때문입니다. */}
        <div onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}><button type="button" onClick={openWorkspace}>내 워크스페이스</button><button type="button" onClick={() => navigate('settings')}>설정</button><button type="button" onClick={logout}>로그아웃</button></div>
      </details> : <button type="button" className="sw-secondary" onClick={openWorkspace}>로그인</button>}
    </div>
  </header>
}
