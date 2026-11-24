import { Bell, Building2, CalendarDays, CircleAlert, CircleCheck, ClipboardList, Clock3, LayoutGrid, Settings, X } from 'lucide-react'
import { Brand } from './TopHeader'
import type { View } from './smartwork-data'
import type { Team } from '../api/team'

const links = [
  ['workspace', '워크스페이스', LayoutGrid], ['calendar', '캘린더', CalendarDays], ['today', '오늘의 업무', Clock3], ['notifications', '알림', Bell],
  ['overdue', '지연 업무', CircleAlert], ['completed', '완료 업무', CircleCheck], ['clients', '업체 관리', Building2],
  ['reports', '회의·보고서', ClipboardList], ['settings', '설정', Settings],
] as const

// 와이어프레임처럼 사이드바 맨 위에서 팀 공간과 개인 공간을 전환합니다. 업체 관리는 영업형 팀에만, 보고서는 팀 공간에만 있습니다.
export default function Sidebar({ view, navigate, alerts, overdue, todayCount = 0, completedCount = 0, open, close, personal, teamName, userName, showClients,
  teams, currentTeamId, ownTeamId, selectTeam }: {
  view: View; navigate: (view: View) => void; alerts: number; overdue: number; todayCount?: number; completedCount?: number; open: boolean; close: () => void
  personal: boolean; teamName?: string; userName?: string; showClients: boolean
  teams?: Team[]; currentTeamId?: number; ownTeamId?: number; selectTeam: (id: number) => void
}) {
  const own = teams?.find(team => team.id === ownTeamId)
  const others = teams?.filter(team => team.id !== ownTeamId) ?? []
  const visible = links.filter(([id]) => showClients || id !== 'clients')
  return <><aside className={`sw-sidebar ${open ? 'sw-sidebar-open' : ''}`} aria-label="워크스페이스 메뉴">
    <div className="sw-sidebar-brand"><button type="button" onClick={() => { navigate('portal'); close() }}><Brand short /></button>
      <button type="button" className="sw-icon-button sw-mobile-menu" onClick={close} aria-label="메뉴 닫기"><X size={18} /></button>
    </div>
    {/* 팀/개인 전환은 캘린더의 팀·개인 버튼으로 합니다. 전사 조회 권한이 있으면 볼 팀을 여기서 고릅니다. */}
    <div className="sw-space-switch">
      <p className="sw-space-name"><i aria-hidden="true" />{personal ? '개인 캘린더 (' + (userName ?? '나') + ')' : teamName ?? '팀'}</p>
      {teams && teams.length > 1 && <label className="sw-team-select"><span>팀 선택</span>
        <select aria-label="팀 공간 선택" value={personal ? '' : currentTeamId ?? ''} onChange={event => selectTeam(Number(event.target.value))}>
          {personal && <option value="" disabled>팀을 고르세요</option>}
          {own && <optgroup label="내 팀"><option value={own.id}>{own.name}</option></optgroup>}
          <optgroup label="다른 팀 (조회 전용)">{others.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</optgroup>
        </select></label>}
    </div>
    <nav aria-label="업무 메뉴">{visible.map(([id, label, Icon]) => {
      const count = { today: todayCount, notifications: alerts, overdue, completed: completedCount }[id as string] ?? 0
      const tone = id === 'overdue' ? 'sw-nav-danger' : id === 'today' ? 'sw-nav-info' : id === 'completed' ? 'sw-nav-done' : ''
      return <button type="button" key={id} aria-current={view === id ? 'page' : undefined} onClick={() => { navigate(id); close() }}>
        <Icon size={17} aria-hidden="true" /><span>{label}</span>{count > 0 && <b className={tone}>{count}</b>}
      </button>
    })}</nav>
  </aside>{open && <button className="sw-sidebar-overlay" type="button" onClick={close} aria-label="메뉴 닫기" />}</>
}
