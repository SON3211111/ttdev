import { useEffect, useState, type FormEvent } from 'react'
import { canViewAll, roleLabels, teamGet, teamWrite, titleLabel, titles, withTeam, type Role, type Team, type TeamMember, type TeamSession, type TeamUser, type Title } from '../api/team'
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

type InviteInfo = { email: string; role: Role; teamName: string }

// 가입(초대 수락)과 처음 설정에서는 직급을 본인이 고릅니다. 처음 설정에서는 소속 팀도 고릅니다.
// 대표·본부장은 회사 전체에 각각 1명이라, 이미 있으면 고를 수 없게 표시합니다.
// '팀장' 직급은 팀장 권한과 같아서 팀장으로 초대받으면 팀장으로 고정되고, 팀원으로 초대받으면 고를 수 없습니다.
function signInFields(invite: boolean, setup: boolean, teams: { id: number; name: string }[] = [], taken: Title[] = [], inviteRole?: Role) {
  const blocked = (title: Title) => taken.includes(title) ? ' (이미 있음)' : invite && inviteRole !== 'LEAD' && title === '팀장' ? ' (팀장 초대로만)' : ''
  return <>
    {(invite || setup) && <label>이름<input name="name" required maxLength={80} autoComplete="name" /></label>}
    {!invite && <label>이메일<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>}
    <label>비밀번호<input name="password" type="password" required minLength={invite || setup ? 12 : undefined}
      maxLength={128} autoComplete={invite || setup ? 'new-password' : 'current-password'} /></label>
    {setup && <label>소속 팀<select name="teamId" aria-label="소속 팀" required defaultValue={teams[0]?.id}>
      {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
    {invite && inviteRole === 'LEAD' && <label>직급<select name="title" aria-label="직급" value="팀장" disabled onChange={() => undefined}><option>팀장</option></select></label>}
    {(setup || (invite && inviteRole !== 'LEAD')) && <label>직급<select name="title" aria-label="직급" defaultValue={setup ? '팀장' : '프로'}>
      {titles.map(title => <option key={title} value={title} disabled={!!blocked(title)}>{title}{blocked(title)}</option>)}</select></label>}
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
  const [selectedTeam, setSelectedTeam] = useState<number>()
  const [inviteInfo, setInviteInfo] = useState<InviteInfo>()
  const user = session?.user
  const isAdmin = !!user?.isAdmin
  const viewAll = canViewAll(user)
  // 기본은 내 팀입니다. 관리자·대표·본부장이 다른 팀을 고르면 그 팀을 읽기 전용으로 보고, 요청에 ?team=을 붙입니다.
  const viewTeam = viewAll && selectedTeam && selectedTeam !== user?.teamId ? selectedTeam : undefined
  const otherTeam = viewTeam ? teams.find(team => team.id === viewTeam) : undefined
  const viewTeamName = otherTeam?.name ?? user?.teamName
  const viewTeamKind = otherTeam?.kind ?? user?.teamKind ?? 'SALES'

  useEffect(() => {
    const controller = new AbortController()
    teamGet<TeamSession>('auth/session', controller.signal).then(setSession).catch(error => {
      if (!controller.signal.aborted) setError(message(error))
    })
    return () => controller.abort()
  }, [])

  // 초대 링크로 들어오면 어느 팀에 어떤 자리로 초대됐는지 먼저 읽습니다.
  useEffect(() => {
    if (!invite) return
    const controller = new AbortController()
    teamGet<InviteInfo>('auth/invite?token=' + invite, controller.signal).then(setInviteInfo).catch(error => {
      if (!controller.signal.aborted) setError(message(error))
    })
    return () => controller.abort()
  }, [invite])

  // 초대 링크를 직접 붙여 넣는 경우에도 링크가 올바르면 초대 정보를 읽습니다.
  function readInviteLink(value: string) {
    let token: string
    try { token = new URL(value).searchParams.get('invite') ?? '' } catch { token = '' }
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setInviteInfo(undefined)
      return
    }
    teamGet<InviteInfo>('auth/invite?token=' + token).then(setInviteInfo).catch(error => setError(message(error)))
  }

  useEffect(() => {
    if (!user || invite) return
    const controller = new AbortController()
    teamGet<Team[]>('teams', controller.signal).then(setTeams).catch(error => {
      if (!controller.signal.aborted) setError(message(error))
    })
    return () => controller.abort()
    // 팀장·인원·오늘·지연 숫자가 최신이 되도록 화면을 옮길 때마다 다시 읽습니다.
  }, [user, invite, view])

  useEffect(() => {
    if (!user || invite) return
    const controller = new AbortController()
    teamGet<TeamMember[]>(withTeam('members', viewTeam), controller.signal).then(setMembers).catch(error => {
      if (!controller.signal.aborted) setError(message(error))
    })
    return () => controller.abort()
  }, [user, invite, view, viewTeam])

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
      const payload = joining ? { name: fields.name, password: fields.password, title: fields.title, token }
        : action === 'setup' ? { ...fields, teamId: Number(fields.teamId) } : fields
      const result = await teamWrite<{ user: TeamUser }>('auth/' + action, 'POST', payload)
      setSession({ user: result.user, setupRequired: false })
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
      setSelectedTeam(undefined)
      navigate('portal')
    })
  }

  // 다른 팀을 고르면 팀 캘린더로 이동하고, 워크스페이스 선택 화면으로 가면 내 팀으로 돌아옵니다.
  function viewTeamCalendar(id?: number) {
    setSelectedTeam(id)
    navigate('team-calendar')
  }

  const reportsPanel = user && <>
    <h1 className="sw-page-title">회의·보고서</h1>
    <div className="ttech-actions ttech-report-tabs">
      <button type="button" aria-pressed={reportTab === 'daily'} onClick={() => setReportTab('daily')}>일일회의 보고서</button>
      <button type="button" aria-pressed={reportTab === 'weekly'} onClick={() => setReportTab('weekly')}>주간회의 보고서</button>
      <button type="button" aria-pressed={reportTab === 'personal'} onClick={() => setReportTab('personal')}>주간 업무보고</button>
    </div>
    {viewTeam && <p className="ttech-muted">{viewTeamName} 보고서를 읽기 전용으로 보고 있습니다.</p>}
    {reportTab === 'personal' ? <TeamReports key={'reports-' + (viewTeam ?? 'own')} user={user} members={members} teamId={viewTeam} readOnly={!!viewTeam} />
      : <TeamMeetings key={reportTab + '-' + (viewTeam ?? 'own')} user={user} kind={reportTab} teamId={viewTeam} readOnly={!!viewTeam} />}
  </>

  // 설정: 관리자는 조직 관리, 팀장은 자기 팀원 초대, 그 외에는 안내만 봅니다.
  const settingsPanel = user && (isAdmin ? <OrgAdmin teams={teams} reloadTeams={reloadTeams} ownTeamId={user.teamId} />
    : user.role === 'LEAD' ? <TeamInvites user={user} />
      : <p className="ttech-muted">팀원 초대는 팀장과 관리자가 합니다.</p>)

  const workspacePanel = user && <WorkspaceHome user={user} teams={teams} members={viewTeam ? [] : members}
    openTeam={id => viewTeamCalendar(id)} openPersonal={() => navigate('personal-calendar')} openSettings={() => navigate('team-settings')} />

  const common = { user, logout, openWorkspace: () => { setSelectedTeam(undefined); navigate('workspaces') } }
  const routes: Record<string, View> = { 'team-calendar': 'calendar', 'team-reports': 'reports', 'team-settings': 'settings', workspaces: 'workspace' }
  const smartView = portal ? 'portal' : routes[view] ?? (view.startsWith('smart-') ? view.slice(6) : '')
  if (!invite && smartViews.has(smartView) && (portal || user)) {
    // 다른 팀으로 바꾸면 이전 팀 업무가 남지 않도록 화면을 새로 그립니다.
    return <Smartwork key={'team-' + (user?.id ?? 'signed-out') + '-' + (viewTeam ?? 'own')} currentView={smartView as View} {...common}
      members={members} navigate={next => navigate(next === 'portal' ? 'portal' : `smart-${next}`)} switchWorkspace={() => navigate('personal-calendar')}
      reports={reportsPanel} workspacePanel={workspacePanel} settingsPanel={settingsPanel}
      teamName={viewTeamName} teamId={viewTeam} teamKind={viewTeamKind} readOnly={!!viewTeam}
      teams={viewAll ? teams : undefined} ownTeamId={user?.teamId} selectTeam={id => setSelectedTeam(id === user?.teamId ? undefined : id)} />
  }
  // 개인 워크스페이스도 같은 캘린더 화면을 쓰고, 데이터는 본인만 접근하는 personal API에서 읽습니다. 보고서는 팀 공간에만 있습니다.
  const personalView = view.startsWith('personal-') ? view.slice(9) : ''
  if (!invite && user && smartViews.has(personalView) && !['portal', 'reports'].includes(personalView)) {
    return <Smartwork key={'personal-' + user.id} personal currentView={personalView as View} {...common} members={members}
      navigate={next => navigate(next === 'portal' ? 'portal' : next === 'workspace' ? 'workspaces' : `personal-${next}`)}
      switchWorkspace={() => viewTeamCalendar(undefined)} reports={null} workspacePanel={workspacePanel} settingsPanel={settingsPanel}
      teamName={user.teamName} teamKind={user.teamKind} teams={viewAll ? teams : undefined} ownTeamId={user.teamId}
      selectTeam={id => viewTeamCalendar(id === user.teamId ? undefined : id)} />
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
        <h1>{joining ? '팀 초대 수락' : setup ? '처음 설정' : '로그인'}</h1>
        {!invite && <div className="ttech-actions">
          <button type="button" disabled={pending} aria-pressed={!memberEntry} onClick={() => {
            setMemberEntry(false)
            setError('')
          }}>{session.setupRequired ? '처음 설정하기' : '기존 계정'}</button>
          <button type="button" disabled={pending} aria-pressed={memberEntry} onClick={() => {
            setMemberEntry(true)
            setError('')
          }}>초대받아 가입</button>
        </div>}
        <form key={joining ? 'member' : setup ? 'setup' : 'login'} onSubmit={enter} className="ttech-form">
          {memberEntry && !invite && <label>초대 링크<input name="inviteLink" type="url" required onChange={event => readInviteLink(event.target.value)} /></label>}
          {joining && inviteInfo && <p className="ttech-invite-info"><strong>{inviteInfo.teamName}</strong> · {roleLabels[inviteInfo.role]}으로 초대되었습니다 ({inviteInfo.email})</p>}
          {signInFields(joining, setup, session.teams, session.takenTitles, inviteInfo?.role)}
          {setup && <p className="ttech-muted">처음 설치할 때 한 번만 하는 설정입니다. 이 계정은 관리자 권한을 가지며 다른 팀의 팀장과 팀원을 초대합니다. 직급을 팀장으로 고르면 고른 팀의 팀장도 맡습니다.</p>}
          {joining && <p className="ttech-muted">직급은 이름 옆에 표시됩니다. 팀장은 부서마다 1명이라 팀장으로 초대받은 경우에만 팀장이 되고, 대표·본부장은 회사에 각각 1명입니다.</p>}
          <button disabled={pending} type="submit">{joining ? '팀에 참여하기' : setup ? '관리자로 시작' : '로그인'}</button>
        </form>
      </section>}
      {user && !invite && !portal && <section className="ttech-panel ttech-workspace-home" aria-labelledby="workspace-home-title">
        <h1 id="workspace-home-title">팀 업무</h1>
        <p>{user.name} · {user.teamName} {titleLabel(user)}</p>
        <button type="button" onClick={() => navigate('workspaces')}>내 워크스페이스 열기</button>
      </section>}
    </main>
  )
}
