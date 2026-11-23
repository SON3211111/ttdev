import { useEffect, useState, type FormEvent } from 'react'
import { roleLabels, teamGet, teamWrite, withTeam, type Team, type TeamMember, type TeamSession, type TeamUser } from '../api/team'
import TeamReports from './TeamReports'
import OrgAdmin from './OrgAdmin'
import TeamMeetings from './TeamMeetings'
import TeamInvites from './TeamInvites'
import WorkspaceHome from './WorkspaceHome'
import Smartwork from './Smartwork'
import { smartViews, type View } from '../components/smartwork-data'
import './TeamWorkspace.css'

function message(error: unknown) {
  return error instanceof Error ? error.message : '다시 시도해 주세요.'
}

function signInFields(invite: boolean, setup: boolean) {
  return <>
    {(invite || setup) && <label>이름<input name="name" required maxLength={80} autoComplete="name" /></label>}
    {!invite && <label>이메일<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>}
    <label>비밀번호<input name="password" type="password" required minLength={invite || setup ? 12 : undefined}
      maxLength={128} autoComplete={invite || setup ? 'new-password' : 'current-password'} /></label>
  </>
}

type WorkspacePage = 'portal' | 'team' | 'workspaces' | 'team-calendar' | 'personal-calendar' | 'team-reports' | 'team-settings' | `smart-${View}` | `personal-${View}`

// 로그인·초대 수락은 이 화면에서 처리하고, 로그인한 뒤의 화면(캘린더·워크스페이스·보고서·설정)은 모두 Smartwork 틀 안에 그립니다.
export default function TeamWorkspace({ onOpenChat, view, navigate }: {
  onOpenChat: () => void; view: string; navigate: (next: WorkspacePage) => void
}) {
  const [session, setSession] = useState<TeamSession>()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [invite, setInvite] = useState(() => new URLSearchParams(location.search).get('invite') ?? '')
  const [memberEntry, setMemberEntry] = useState(false)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [reportTab, setReportTab] = useState<'daily' | 'weekly' | 'personal'>('daily')
  const [teams, setTeams] = useState<Team[]>([])
  const [adminTeam, setAdminTeam] = useState<number>()
  const user = session?.user
  const isAdmin = user?.role === 'ADMIN'
  // 관리자는 팀이 없어서 조회할 팀을 고릅니다(처음에는 첫 번째 팀). 팀원·팀장은 자기 팀만 봅니다.
  const viewTeam = isAdmin ? adminTeam ?? teams[0]?.id : undefined
  const viewTeamInfo = isAdmin ? teams.find(team => team.id === viewTeam) : undefined
  const viewTeamName = isAdmin ? viewTeamInfo?.name : user?.teamName ?? undefined
  const viewTeamKind = (isAdmin ? viewTeamInfo?.kind : user?.teamKind) ?? 'SALES'

  useEffect(() => {
    const controller = new AbortController()
    teamGet<TeamSession>('auth/session', controller.signal).then(setSession).catch(error => {
      if (!controller.signal.aborted) setError(message(error))
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!user || invite) return
    const controller = new AbortController()
    teamGet<Team[]>('teams', controller.signal).then(setTeams).catch(error => {
      if (!controller.signal.aborted) setError(message(error))
    })
    return () => controller.abort()
  }, [user, invite])

  useEffect(() => {
    if (!user || invite || (isAdmin && !viewTeam)) return
    const controller = new AbortController()
    teamGet<TeamMember[]>(withTeam('members', viewTeam), controller.signal).then(setMembers).catch(error => {
      if (!controller.signal.aborted) setError(message(error))
    })
    return () => controller.abort()
  }, [user, invite, view, isAdmin, viewTeam])

  async function reloadTeams() {
    setTeams(await teamGet<Team[]>('teams'))
  }

  async function run(action: () => Promise<void>) {
    setPending(true)
    setError('')
    try {
      await action()
    } catch (error) {
      setError(message(error))
    } finally {
      setPending(false)
    }
  }

  function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    const joining = !!invite || memberEntry
    const action = joining ? 'accept' : session?.setupRequired ? 'setup' : 'login'
    void run(async () => {
      let token = invite
      if (joining && !token) {
        try {
          token = new URL(String(fields.inviteLink)).searchParams.get('invite') ?? ''
        } catch {
          throw new Error('받은 초대 링크를 입력해 주세요.')
        }
        if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('받은 초대 링크를 확인해 주세요.')
      }
      const payload = joining ? { name: fields.name, password: fields.password, token } : fields
      const result = await teamWrite<{ user: TeamUser }>('auth/' + action, 'POST', payload)
      setSession(current => ({ user: result.user, setupRequired: action === 'setup' ? false : current?.setupRequired ?? false }))
      if (invite) {
        window.history.replaceState(null, '', window.location.pathname)
        setInvite('')
      }
      setMemberEntry(false)
    })
  }

  const portal = view === 'portal' && !invite
  const showSignIn = !portal && session && (!user || invite)
  const joining = !!invite || memberEntry
  const setup = !joining && !!session?.setupRequired

  function logout() {
    void run(async () => {
      await teamWrite<void>('auth/logout', 'POST')
      setSession({ user: null, setupRequired: false })
      navigate('portal')
    })
  }

  const reportsPanel = user && <>
    <h1 className="sw-page-title">회의·보고서</h1>
    <div className="ttech-actions ttech-report-tabs">
      <button type="button" aria-pressed={reportTab === 'daily'} onClick={() => setReportTab('daily')}>일일회의 보고서</button>
      <button type="button" aria-pressed={reportTab === 'weekly'} onClick={() => setReportTab('weekly')}>주간회의 보고서</button>
      <button type="button" aria-pressed={reportTab === 'personal'} onClick={() => setReportTab('personal')}>주간 업무보고</button>
    </div>
    {isAdmin && <p className="ttech-muted">{viewTeamName} 보고서를 읽기 전용으로 보고 있습니다.</p>}
    {reportTab === 'personal' ? <TeamReports key={'reports-' + viewTeam} user={user} members={members} teamId={viewTeam} readOnly={isAdmin} />
      : <TeamMeetings key={reportTab + '-' + viewTeam} user={user} kind={reportTab} teamId={viewTeam} readOnly={isAdmin} />}
  </>

  // 설정: 관리자는 조직 관리, 팀장은 팀원 초대(기존 설치라면 관리자 계정 만들기 포함), 팀원은 안내만 봅니다.
  const settingsPanel = user && (isAdmin ? <OrgAdmin teams={teams} reloadTeams={reloadTeams} />
    : user.role === 'LEAD' ? <TeamInvites user={user} setupRequired={!!session?.setupRequired} signInFields={signInFields(false, true)}
      onAdminCreated={() => setSession(current => current && { ...current, setupRequired: false })} />
      : <p className="ttech-muted">팀원 초대는 팀장과 관리자가 합니다.</p>)

  const workspacePanel = user && <WorkspaceHome user={user} teamId={viewTeam} teamName={viewTeamName} members={members}
    openTeam={() => navigate('team-calendar')} openPersonal={() => navigate('personal-calendar')} openSettings={() => navigate('team-settings')} />

  const common = { user, members, logout, openWorkspace: () => navigate('workspaces') }
  const routes: Record<string, View> = { 'team-calendar': 'calendar', 'team-reports': 'reports', 'team-settings': 'settings', workspaces: 'workspace' }
  const smartView = portal ? 'portal' : routes[view] ?? (view.startsWith('smart-') ? view.slice(6) : '')
  if (!invite && smartViews.has(smartView) && (portal || user)) {
    // 관리자가 조회할 팀을 바꾸면 이전 팀 업무가 남지 않도록 화면을 새로 그립니다.
    return <Smartwork key={'team-' + (user?.id ?? 'signed-out') + '-' + (viewTeam ?? '')} currentView={smartView as View} {...common}
      navigate={next => navigate(next === 'portal' ? 'portal' : `smart-${next}`)} switchWorkspace={() => navigate('personal-calendar')}
      reports={reportsPanel} workspacePanel={workspacePanel} settingsPanel={settingsPanel}
      teamName={viewTeamName} teamId={viewTeam} teamKind={viewTeamKind} teams={isAdmin ? teams : undefined} selectTeam={setAdminTeam} readOnly={isAdmin} />
  }
  // 개인 워크스페이스도 같은 캘린더 화면을 쓰고, 데이터는 본인만 접근하는 personal API에서 읽습니다. 보고서는 팀 공간에만 있습니다.
  const personalView = view.startsWith('personal-') ? view.slice(9) : ''
  if (!invite && user && smartViews.has(personalView) && !['portal', 'reports'].includes(personalView)) {
    return <Smartwork key={'personal-' + user.id} personal currentView={personalView as View} {...common}
      navigate={next => navigate(next === 'portal' ? 'portal' : next === 'workspace' ? 'workspaces' : `personal-${next}`)}
      switchWorkspace={() => navigate('team-calendar')} reports={null} workspacePanel={workspacePanel} settingsPanel={settingsPanel}
      teamName={user.teamName ?? undefined} teamKind={user.teamKind ?? 'SUPPORT'} />
  }

  return (
    <main className="ttech-shell">
      <header className="ttech-header">
        <a href="#portal" onClick={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          navigate('portal')
        }}><strong>t&amp;tech</strong></a>
        {user && !invite && !portal && <button type="button" onClick={() => navigate('workspaces')}>워크스페이스</button>}
        <a href="#chat" onClick={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          event.preventDefault()
          onOpenChat()
        }}>팀 채팅 미리보기</a>
        {user && !invite && <button type="button" disabled={pending} onClick={logout}>로그아웃</button>}
      </header>
      {error && <p role="alert" className="ttech-error">{error}</p>}
      {!portal && !session && !error && <p role="status">팀 정보를 불러오는 중입니다.</p>}
      {showSignIn && <section className="ttech-panel ttech-auth">
        <h1>{joining ? '팀 초대 수락' : setup ? '관리자 계정 설정' : '로그인'}</h1>
        {!invite && <div className="ttech-actions">
          <button type="button" disabled={pending} aria-pressed={!memberEntry} onClick={() => {
            setMemberEntry(false)
            setError('')
          }}>{session.setupRequired ? '관리자로 시작' : '기존 계정'}</button>
          <button type="button" disabled={pending} aria-pressed={memberEntry} onClick={() => {
            setMemberEntry(true)
            setError('')
          }}>팀원으로 참여</button>
        </div>}
        <form key={joining ? 'member' : setup ? 'setup' : 'login'} onSubmit={enter} className="ttech-form">
          {memberEntry && !invite && <label>초대 링크<input name="inviteLink" type="url" required /></label>}
          {signInFields(joining, setup)}
          {setup && <p className="ttech-muted">처음 설치할 때 한 번만 만드는 관리자 계정입니다. 관리자가 팀장과 팀원을 초대합니다.</p>}
          <button disabled={pending} type="submit">{joining ? '팀에 참여하기' : setup ? '관리자 계정 만들기' : '로그인'}</button>
        </form>
      </section>}
      {user && !invite && !portal && <section className="ttech-panel ttech-workspace-home" aria-labelledby="workspace-home-title">
        <h1 id="workspace-home-title">팀 업무</h1>
        <p>{user.name} · {user.teamName ? user.teamName + ' ' : ''}{roleLabels[user.role]}</p>
        <button type="button" onClick={() => navigate('workspaces')}>내 워크스페이스 열기</button>
      </section>}
    </main>
  )
}
