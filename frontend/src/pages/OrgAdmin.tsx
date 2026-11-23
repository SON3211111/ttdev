import { useEffect, useState, type FormEvent } from 'react'
import { teamGet, teamKindLabels, teamWrite, titles, uniqueTitles, type Role, type Team, type TeamKind, type Title } from '../api/team'
import { InviteLink, PendingInvites } from './TeamInvites'

type Account = { id: number; name: string; email: string; role: Role; isAdmin: boolean; title: Title; teamId: number; teamName: string }
const kinds = Object.keys(teamKindLabels) as TeamKind[]

function message(error: unknown) {
  return error instanceof Error ? error.message : '다시 시도해 주세요.'
}

// 관리자 전용 조직 관리: 팀 정보 수정·추가, 팀·역할을 지정한 초대, 사용자 팀 이동·팀장 지정·직급 수정·관리자 권한.
export default function OrgAdmin({ teams, reloadTeams, ownTeamId }: { teams: Team[]; reloadTeams: () => Promise<void>; ownTeamId: number }) {
  const [accounts, setAccounts] = useState<Account[]>()
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [pending, setPending] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [editing, setEditing] = useState<number>()
  const [inviteVersion, setInviteVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    teamGet<Account[]>('users', controller.signal).then(setAccounts).catch(error => {
      if (!controller.signal.aborted) setError(message(error))
    })
    return () => controller.abort()
  }, [])

  async function run(action: () => Promise<string>) {
    setPending(true)
    setError('')
    setFeedback('')
    try {
      setFeedback(await action())
    } catch (error) {
      setError(message(error))
    } finally {
      setPending(false)
    }
  }

  function teamInput(form: HTMLFormElement) {
    const data = new FormData(form)
    return { name: String(data.get('name') ?? '').trim(), kind: String(data.get('kind')), location: String(data.get('location') ?? '').trim() }
  }

  function saveTeam(event: FormEvent<HTMLFormElement>, id?: number) {
    event.preventDefault()
    const form = event.currentTarget
    const input = teamInput(form)
    void run(async () => {
      await teamWrite(id ? 'teams/' + id : 'teams', id ? 'PUT' : 'POST', input)
      await reloadTeams()
      setEditing(undefined)
      if (!id) form.reset()
      return input.name + ' 팀을 저장했습니다.'
    })
  }

  function saveAccount(event: FormEvent<HTMLFormElement>, account: Account) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const role = String(data.get('role'))
    const picked = String(data.get('title') ?? '')
    // 팀장 권한이면 직급은 서버에서 팀장으로 맞추고, 팀원 권한인데 팀장으로 남아 있으면 프로로 내립니다.
    const title = role === 'LEAD' ? undefined : !picked || picked === '팀장' ? '프로' : picked
    const input = { teamId: Number(data.get('teamId')), role, title, isAdmin: data.get('isAdmin') === 'on' }
    void run(async () => {
      await teamWrite('users/' + account.id, 'PUT', input)
      setAccounts(await teamGet<Account[]>('users'))
      await reloadTeams()
      return account.name + '님의 소속을 저장했습니다.'
    })
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const input = { email: String(data.get('email')), teamId: Number(data.get('teamId')), role: String(data.get('role')) }
    setInviteUrl('')
    void run(async () => {
      const { token } = await teamWrite<{ token: string }>('auth/invite', 'POST', input)
      const url = new URL(location.pathname, location.origin)
      url.searchParams.set('invite', token)
      setInviteUrl(url.toString())
      setInviteVersion(value => value + 1)
      return '초대 링크를 만들었습니다.'
    })
  }

  const teamOptions = teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)

  return <div className="ttech-org">
    {error && <p role="alert" className="ttech-error">{error}</p>}
    <p className="sr-only" role="status">{feedback}</p>
    {feedback && <p className="ttech-feedback" aria-hidden="true">{feedback}</p>}

    <section className="ttech-panel" aria-labelledby="org-teams-title">
      <h2 id="org-teams-title">팀 ({teams.length})</h2>
      <div className="ttech-table-wrap"><table className="ttech-table">
        <thead><tr><th>팀</th><th>유형</th><th>근무지</th><th>팀장</th><th>인원</th><th><span className="sr-only">수정</span></th></tr></thead>
        <tbody>{teams.map(team => editing === team.id
          ? <tr key={team.id}><td colSpan={6}>
            <form className="ttech-inline-form" onSubmit={event => saveTeam(event, team.id)} aria-label={team.name + ' 수정'}>
              <label>팀 이름<input name="name" required maxLength={60} defaultValue={team.name} /></label>
              <label>유형<select name="kind" aria-label="유형" defaultValue={team.kind}>{kinds.map(kind => <option key={kind} value={kind}>{teamKindLabels[kind]}</option>)}</select></label>
              <label>근무지<input name="location" required maxLength={20} defaultValue={team.location} /></label>
              <button type="submit" disabled={pending}>저장</button>
              <button type="button" className="ttech-secondary" onClick={() => setEditing(undefined)}>취소</button>
            </form>
          </td></tr>
          : <tr key={team.id}><td>{team.name}</td><td>{teamKindLabels[team.kind]}</td><td>{team.location}</td>
            <td>{team.leadName ?? <span className="ttech-muted">미지정</span>}</td><td>{team.memberCount}명</td>
            <td><button type="button" className="ttech-link" onClick={() => setEditing(team.id)} aria-label={team.name + ' 수정'}>수정</button></td></tr>)}
        </tbody>
      </table></div>
      <form className="ttech-inline-form" onSubmit={event => saveTeam(event)} aria-label="팀 추가">
        <label>새 팀 이름<input name="name" required maxLength={60} /></label>
        <label>유형<select name="kind" aria-label="유형" defaultValue="SALES">{kinds.map(kind => <option key={kind} value={kind}>{teamKindLabels[kind]}</option>)}</select></label>
        <label>근무지<input name="location" required maxLength={20} defaultValue="대구 본사" /></label>
        <button type="submit" disabled={pending}>팀 추가</button>
      </form>
    </section>

    <section className="ttech-panel" aria-labelledby="org-invite-title">
      <h2 id="org-invite-title">초대</h2>
      <form className="ttech-inline-form" onSubmit={invite}>
        <label>초대할 이메일<input name="email" type="email" required maxLength={254} /></label>
        <label>팀<select name="teamId" aria-label="팀" required defaultValue={ownTeamId}>{teamOptions}</select></label>
        <label>역할<select name="role" aria-label="역할" defaultValue="MEMBER"><option value="MEMBER">팀원</option><option value="LEAD">팀장</option></select></label>
        <button type="submit" disabled={pending}>초대 링크 만들기</button>
      </form>
      {inviteUrl && <InviteLink url={inviteUrl} />}
    </section>

    <PendingInvites admin version={inviteVersion} />

    <section className="ttech-panel" aria-labelledby="org-users-title">
      <h2 id="org-users-title">사용자 {accounts && `(${accounts.length})`}</h2>
      {!accounts && !error && <p role="status">사용자를 불러오는 중입니다.</p>}
      {accounts && <div className="ttech-table-wrap"><table className="ttech-table">
        <thead><tr><th>이름</th><th>이메일</th><th>소속·권한·직급</th></tr></thead>
        <tbody>{accounts.map(account => <tr key={account.id}>
          <td>{account.name}</td><td>{account.email}</td>
          <td><form className="ttech-inline-form" onSubmit={event => saveAccount(event, account)} aria-label={account.name + ' 소속 변경'}>
              <select name="teamId" aria-label={account.name + ' 팀'} defaultValue={account.teamId}>{teamOptions}</select>
              <select name="role" aria-label={account.name + ' 권한'} defaultValue={account.role}><option value="MEMBER">팀원 권한</option><option value="LEAD">팀장 권한</option></select>
              <select name="title" aria-label={account.name + ' 직급'} defaultValue={account.title}>{titles.map(title => {
                const holder = uniqueTitles.includes(title) && accounts.find(other => other.title === title && other.id !== account.id)
                if (title === '팀장') return <option key={title} value={title} disabled>팀장 (팀장 권한으로 지정)</option>
                return <option key={title} value={title} disabled={!!holder}>{title}{holder ? ` (${holder.name})` : ''}</option>
              })}</select>
              <label className="ttech-check"><input type="checkbox" name="isAdmin" defaultChecked={account.isAdmin} aria-label={account.name + ' 관리자 권한'} />관리자</label>
              <button type="submit" disabled={pending}>저장</button>
            </form></td>
        </tr>)}</tbody>
      </table></div>}
      <p className="ttech-muted">팀장은 부서마다 1명이며, 팀장 권한을 주면 직급도 팀장이 되고 그 팀의 기존 팀장은 팀원 권한·프로가 됩니다. 직급은 본인이 가입할 때 고른 표시용이며 여기서 고칠 수 있습니다. 대표·본부장은 회사 전체에 각각 1명이고 전체 팀을 조회합니다. 관리자는 최소 1명 남아야 합니다. 팀을 옮겨도 이미 등록된 업무는 원래 팀에 남습니다.</p>
    </section>
  </div>
}
