import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, ChevronRight, CircleHelp, EyeOff, Globe, Lock, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { canViewAll, teamGet, teamKindLabels, titleLabel, type Team, type TeamMember, type TeamUser } from '../api/team'
import { PendingInvites, TeamInviteForm } from './TeamInvites'

type Dashboard = { today: unknown[]; week: unknown[]; month: unknown[]; overdue: unknown[] }

// 와이어프레임의 워크스페이스 선택 화면: 내 팀 공간과 개인 공간 카드(통계), 구성원, 작동 방식, 초대 대기.
// 관리자·대표·본부장에게는 아래에 '전체 팀 현황(조회 전용)'을 함께 보여줍니다.
export default function WorkspaceHome({ user, teams, members, openTeam, openPersonal, openSettings }: {
  user: TeamUser; teams: Team[]; members: TeamMember[]
  openTeam: (id?: number) => void; openPersonal: () => void; openSettings: () => void
}) {
  const [team, setTeam] = useState<Dashboard>()
  const [personal, setPersonal] = useState<Dashboard>()
  const [inviting, setInviting] = useState(false)
  const [inviteVersion, setInviteVersion] = useState(0)
  const lead = members.find(member => member.role === 'LEAD')
  const canInvite = user.isAdmin || user.role === 'LEAD'
  const others = canViewAll(user) ? teams.filter(item => item.id !== user.teamId) : []

  useEffect(() => {
    const controller = new AbortController()
    teamGet<Dashboard>('dashboard', controller.signal).then(setTeam).catch(() => undefined)
    teamGet<Dashboard>('personal/dashboard', controller.signal).then(setPersonal).catch(() => undefined)
    return () => controller.abort()
  }, [])

  const count = (value?: unknown[]) => value ? value.length + '건' : '—'
  return <div className="sw-spaces">
    <header className="sw-spaces-head">
      <div>
        <p className="sw-spaces-tag"><i aria-hidden="true" />{user.isAdmin ? '워크스페이스 관리자 모드' : user.title} <span>T&amp;T Workspace</span></p>
        <h1 className="sw-page-title">접속할 워크스페이스를 선택하세요</h1>
        <p>팀 업무는 팀 캘린더와 회의·보고서에 함께 쓰이고, 개인 공간의 기록은 본인에게만 보입니다.</p>
      </div>
      <div className="sw-spaces-actions">
        <span className="sw-role-chip"><ShieldCheck size={15} />{user.name} {titleLabel(user)}</span>
        {user.isAdmin && <button type="button" className="sw-secondary" onClick={openSettings}>조직 관리</button>}
        {canInvite && <button type="button" className="sw-primary" aria-expanded={inviting} onClick={() => setInviting(value => !value)}><UserPlus size={16} />새 팀원 초대</button>}
      </div>
    </header>
    {inviting && canInvite && <TeamInviteForm user={user} onInvited={() => setInviteVersion(value => value + 1)} />}

    <div className="sw-space-cards">
      <article className="sw-card sw-space-card sw-space-team">
        <header><span className="sw-space-icon"><Users size={22} /></span>
          <div><h2>{user.teamName} <b className="sw-active-chip">내 팀</b></h2>
            <p>{lead ? `팀 리더: ${lead.name}` : '팀장 미지정'}{members.length > 1 ? ` 외 ${members.length - 1}명` : ''}</p></div>
          <span className="sw-public-chip"><Globe size={13} />팀 공개</span>
        </header>
        <p className="sw-space-desc">팀 전체의 일정과 업무 진행 현황을 함께 관리합니다. 등록한 업무는 회의·주간 보고서에 연결됩니다.</p>
        <dl className="sw-space-stats">
          <div><dt>오늘 팀 업무</dt><dd className="sw-blue">{count(team?.today)}</dd></div>
          <div><dt>이번 주 예정</dt><dd className="sw-green">{count(team?.week)}</dd></div>
          <div><dt>참여 팀원</dt><dd>{members.length}명</dd></div>
        </dl>
        <footer><span className="sw-avatars" aria-hidden="true">{members.slice(0, 3).map(member => <i key={member.id}>{member.name[0]}</i>)}
          {members.length > 3 && <i>+{members.length - 3}</i>}</span>
          <button type="button" className="sw-primary" onClick={() => openTeam()}>팀 공간 바로가기<ArrowRight size={16} /></button></footer>
      </article>

      <article className="sw-card sw-space-card sw-space-personal">
        <header><span className="sw-space-icon"><Lock size={22} /></span>
          <div><h2>개인 공간 <b className="sw-private-chip">비공개 워크스페이스</b></h2><p>소유자: {user.name} (단독 사용)</p></div>
          <span className="sw-danger-chip"><EyeOff size={13} />팀원 열람 불가</span>
        </header>
        <p className="sw-space-desc">본인만 확인하는 비공개 일정과 미확정 업무를 정리합니다. 팀 캘린더나 팀 집계에는 포함되지 않습니다.</p>
        <dl className="sw-space-stats">
          <div><dt>오늘 개인 업무</dt><dd>{count(personal?.today)}</dd></div>
          <div><dt>이번 달 예정</dt><dd>{count(personal?.month)}</dd></div>
          <div><dt>접근 권한</dt><dd className="sw-muted">1인 전용</dd></div>
        </dl>
        <p className="sw-space-note"><ShieldCheck size={15} />개인 공간에 등록한 데이터는 관리자와 동료에게 보이지 않습니다.</p>
        <footer><span className="ttech-muted">독립적인 보관함</span>
          <button type="button" className="sw-secondary" onClick={openPersonal}>개인 공간 입장하기<ChevronRight size={16} /></button></footer>
      </article>
    </div>

    {others.length > 0 && <section className="sw-card sw-all-teams" aria-labelledby="all-teams-title">
      <h2 id="all-teams-title"><Globe size={18} />전체 팀 현황 <small>조회 전용 · {teams.length}개 팀</small></h2>
      <ul>{others.map(item => <li key={item.id} className="sw-team-tile">
        <div><strong>{item.name}</strong><small>{teamKindLabels[item.kind]} · {item.location}</small></div>
        <p>{item.leadName ? `팀장 ${item.leadName}` : <span className="sw-warn"><AlertTriangle size={13} />팀장 미지정</span>} · {item.memberCount}명</p>
        <p className="sw-tile-stats"><span>오늘 {item.todayCount}</span><span className={item.overdueCount ? 'sw-tile-late' : ''}>지연 {item.overdueCount}</span></p>
        {!item.leadName && user.isAdmin
          ? <button type="button" className="sw-secondary" onClick={openSettings} aria-label={item.name + ' 팀장 초대'}>팀장 초대</button>
          : <button type="button" className="sw-secondary" onClick={() => openTeam(item.id)} aria-label={item.name + ' 보기'}>보기<ArrowRight size={14} /></button>}
      </li>)}</ul>
    </section>}

    <div className="sw-space-bottom">
      <section className="sw-card sw-members" aria-labelledby="space-members-title">
        <h2 id="space-members-title"><Users size={18} />{user.teamName} 구성원 ({members.length}명)<small>{user.isAdmin ? '조직 관리에서 팀장 지정·팀 이동' : '팀장 권한: 초대 링크 발급'}</small></h2>
        <ul>{members.map(member => <li key={member.id} className={member.role === 'LEAD' ? 'sw-member-lead' : ''}>
          <span className="sw-avatar">{member.name[0]}</span>
          <span><strong>{member.name} <b>{titleLabel(member)}</b></strong><small>{member.email}</small></span>
        </li>)}</ul>
        {members.length === 0 && <p className="ttech-muted">아직 구성원이 없습니다.</p>}
      </section>
      <div className="sw-space-side">
        <section className="sw-card sw-howto" aria-labelledby="space-howto-title">
          <h2 id="space-howto-title"><CircleHelp size={18} />협업 워크스페이스 작동 방식</h2>
          <ol>
            <li><strong>초대:</strong> 관리자가 팀을 지정해 팀장·팀원을 초대하고, 팀장은 자기 팀원을 초대합니다.</li>
            <li><strong>링크로 가입:</strong> 받은 초대 링크(7일, 1회용)로 계정을 만들면 지정된 팀에 바로 배정됩니다. 직급은 가입할 때 본인이 고릅니다.</li>
            <li><strong>공간 분리:</strong> 팀 캘린더에서 협업하고, 개인 일정은 개인 공간에서 혼자 봅니다. 관리자·대표·본부장은 다른 팀을 조회할 수 있습니다.</li>
          </ol>
        </section>
        {canInvite && <PendingInvites admin={user.isAdmin} version={inviteVersion} />}
      </div>
    </div>
  </div>
}
