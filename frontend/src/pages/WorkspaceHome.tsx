import { useEffect, useState } from 'react'
import { ArrowRight, ChevronRight, CircleHelp, EyeOff, Globe, Lock, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { roleLabels, teamGet, withTeam, type TeamMember, type TeamUser } from '../api/team'
import { PendingInvites } from './TeamInvites'

type Dashboard = { today: unknown[]; week: unknown[]; month: unknown[]; overdue: unknown[] }

// 와이어프레임의 워크스페이스 선택 화면: 팀 공간과 개인 공간 카드(통계), 구성원, 작동 방식, 초대 대기.
export default function WorkspaceHome({ user, teamId, teamName, members, openTeam, openPersonal, openSettings }: {
  user: TeamUser; teamId?: number; teamName?: string; members: TeamMember[]
  openTeam: () => void; openPersonal: () => void; openSettings: () => void
}) {
  const [team, setTeam] = useState<Dashboard>()
  const [personal, setPersonal] = useState<Dashboard>()
  const admin = user.role === 'ADMIN'
  const lead = members.find(member => member.role === 'LEAD')

  useEffect(() => {
    if (admin && !teamId) return
    const controller = new AbortController()
    teamGet<Dashboard>(withTeam('dashboard', teamId), controller.signal).then(setTeam).catch(() => undefined)
    return () => controller.abort()
  }, [admin, teamId])

  useEffect(() => {
    const controller = new AbortController()
    teamGet<Dashboard>('personal/dashboard', controller.signal).then(setPersonal).catch(() => undefined)
    return () => controller.abort()
  }, [])

  const count = (value?: unknown[]) => value ? value.length + '건' : '—'
  return <div className="sw-spaces">
    <header className="sw-spaces-head">
      <div>
        <p className="sw-spaces-tag"><i aria-hidden="true" />{admin ? '워크스페이스 관리자 모드' : roleLabels[user.role]} <span>T&amp;T Workspace</span></p>
        <h1 className="sw-page-title">접속할 워크스페이스를 선택하세요</h1>
        <p>팀 업무는 팀 캘린더와 회의·보고서에 함께 쓰이고, 개인 공간의 기록은 본인에게만 보입니다.</p>
      </div>
      <div className="sw-spaces-actions">
        <span className="sw-role-chip"><ShieldCheck size={15} />{user.name} {user.teamName ? user.teamName + ' ' : ''}{roleLabels[user.role]}</span>
        {user.role !== 'MEMBER' && <button type="button" className="sw-primary" onClick={openSettings}><UserPlus size={16} />{admin ? '조직 관리' : '새 팀원 초대'}</button>}
      </div>
    </header>

    <div className="sw-space-cards">
      <article className="sw-card sw-space-card sw-space-team">
        <header><span className="sw-space-icon"><Users size={22} /></span>
          <div><h2>{teamName ?? '팀 공간'} {!admin && <b className="sw-active-chip">현재 활성 공간</b>}</h2>
            <p>{lead ? `팀 리더: ${lead.name}` : '팀장 미지정'}{members.length > 1 ? ` 외 ${members.length - 1}명` : ''}</p></div>
          <span className="sw-public-chip"><Globe size={13} />{admin ? '조회 전용' : '팀 공개'}</span>
        </header>
        <p className="sw-space-desc">팀 전체의 일정과 업무 진행 현황을 함께 관리합니다. 등록한 업무는 회의·주간 보고서에 연결됩니다.</p>
        <dl className="sw-space-stats">
          <div><dt>오늘 팀 업무</dt><dd className="sw-blue">{count(team?.today)}</dd></div>
          <div><dt>이번 주 예정</dt><dd className="sw-green">{count(team?.week)}</dd></div>
          <div><dt>참여 팀원</dt><dd>{members.length}명</dd></div>
        </dl>
        <footer><span className="sw-avatars" aria-hidden="true">{members.slice(0, 3).map(member => <i key={member.id}>{member.name[0]}</i>)}
          {members.length > 3 && <i>+{members.length - 3}</i>}</span>
          <button type="button" className="sw-primary" onClick={openTeam}>팀 공간 바로가기<ArrowRight size={16} /></button></footer>
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

    <div className="sw-space-bottom">
      <section className="sw-card sw-members" aria-labelledby="space-members-title">
        <h2 id="space-members-title"><Users size={18} />{teamName ?? '팀'} 구성원 ({members.length}명)<small>{admin ? '조직 관리에서 팀장 지정·팀 이동' : '팀장 권한: 초대 링크 발급'}</small></h2>
        <ul>{members.map(member => <li key={member.id} className={member.role === 'LEAD' ? 'sw-member-lead' : ''}>
          <span className="sw-avatar">{member.name[0]}</span>
          <span><strong>{member.name} <b>{roleLabels[member.role]}</b></strong><small>{member.email}</small></span>
        </li>)}</ul>
        {members.length === 0 && <p className="ttech-muted">아직 구성원이 없습니다.</p>}
      </section>
      <div className="sw-space-side">
        <section className="sw-card sw-howto" aria-labelledby="space-howto-title">
          <h2 id="space-howto-title"><CircleHelp size={18} />협업 워크스페이스 작동 방식</h2>
          <ol>
            <li><strong>관리자·팀장 초대:</strong> 관리자가 팀을 지정해 팀장을 초대하고, 팀장은 자기 팀원을 초대합니다.</li>
            <li><strong>링크로 가입:</strong> 받은 초대 링크(7일, 1회용)로 계정을 만들면 지정된 팀에 바로 배정됩니다.</li>
            <li><strong>공간 분리:</strong> 팀 캘린더에서 협업하고, 개인 일정은 개인 공간에서 혼자 봅니다.</li>
          </ol>
        </section>
        {user.role !== 'MEMBER' && <PendingInvites admin={admin} />}
      </div>
    </div>
  </div>
}
