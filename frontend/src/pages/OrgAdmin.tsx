import { useEffect, useState, type FormEvent } from 'react'
import { teamGet, teamKindLabels, teamWrite, titles, uniqueTitles, type Team, type TeamKind, type TeamUser, type Title } from '../api/team'
import { InviteLink, PendingInvites } from './TeamInvites'

type Account = { id: number; name: string; email: string; isAdmin: boolean; isActive: boolean; title: Title; teamId: number | null; managedTeamId: number | null; teamName: string }
type OrgChange = { id: number; actor: string; target: string; changedAt: string; changes: Record<string, { before: string | number | boolean | null; after: string | number | boolean | null }> }
const changeLabels: Record<string, string> = { title: '직급', teamId: '소속 팀', managedTeamId: '담당 팀', isAdmin: '회사 관리', isActive: '계정 상태' }
const kinds = Object.keys(teamKindLabels) as TeamKind[]

function message(error: unknown) {
  return error instanceof Error ? error.message : '다시 시도해 주세요.'
}

// 관리자 전용 조직 관리: 팀 정보 수정·추가, 팀·역할을 지정한 초대, 사용자 팀 이동·팀장 지정·직급 수정·관리자 권한.
export default function OrgAdmin({ teams, reloadTeams, user, onSessionChanged }: {
  teams: Team[]; reloadTeams: () => Promise<void>; user: TeamUser; onSessionChanged: () => Promise<void>
}) {
  const [accounts, setAccounts] = useState<Account[]>()
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [pending, setPending] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [editing, setEditing] = useState<number>()
  const [inviteVersion, setInviteVersion] = useState(0)
  const [pickedTitles, setPickedTitles] = useState<Record<number, Title>>({})
  const [history, setHistory] = useState<OrgChange[]>()

  function loadHistory() {
    teamGet<OrgChange[]>('users/history').then(setHistory).catch(error => setError(message(error)))
  }

  function historyValue(field: string, value: string | number | boolean | null) {
    if (typeof value === 'number') return teams.find(team => team.id === value)?.name ?? String(value)
    if (typeof value === 'boolean') return value ? '있음' : '없음'
    return value ?? (field === 'teamId' ? '소속 팀 없음' : '미지정')
  }

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
    const title = pickedTitles[account.id] ?? account.title
    const teamId = Number(data.get('teamId')) || null
    const managedTeamId = title === '본부장' ? Number(data.get('managedTeamId')) || null : null
    const leadTeam = title === '팀장' ? teamId : managedTeamId
    const currentLead = leadTeam && accounts?.find(other => other.id !== account.id && other.managedTeamId === leadTeam)
    const replaceLead = !!currentLead && window.confirm(currentLead.name + '님을 대신해 ' + account.name + '님을 팀장으로 지정할까요?')
    if (currentLead && !replaceLead) return
    void run(async () => {
      await teamWrite('users/' + account.id, 'PUT', { teamId, title, managedTeamId, replaceLead })
      await onSessionChanged()
      if (!uniqueTitles.includes(user.title) && uniqueTitles.includes(title)) return '회사 관리 권한을 이전했습니다.'
      setAccounts(await teamGet<Account[]>('users'))
      setPickedTitles({})
      if (history) loadHistory()
      await reloadTeams()
      return account.name + '님의 소속을 저장했습니다.'
    })
  }

  function saveOwnMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const teamId = Number(new FormData(event.currentTarget).get('teamId')) || null
    void run(async () => {
      await teamWrite('users/my-membership', 'PUT', { teamId })
      const [updated] = await Promise.all([teamGet<Account[]>('users'), onSessionChanged(), reloadTeams()])
      setAccounts(updated)
      if (history) loadHistory()
      return '내 소속팀을 저장했습니다.'
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

  function changeAccess(account: Account) {
    void run(async () => {
      await teamWrite('users/' + account.id + '/access', 'PUT', { active: !account.isActive })
      setAccounts(await teamGet<Account[]>('users'))
      if (history) loadHistory()
      return account.name + (account.isActive ? '님 계정을 비활성화했습니다.' : '님 계정을 활성화했습니다.')
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
        <label>팀<select name="teamId" aria-label="팀" required defaultValue={user.teamId ?? teams[0]?.id}>{teamOptions}</select></label>
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
        <thead><tr><th>이름</th><th>이메일</th><th>소속·권한·직급</th><th className="ttech-account-status">계정 상태</th></tr></thead>
        <tbody>{accounts.map(account => {
          const title = pickedTitles[account.id] ?? account.title
          const ownAccount = account.id === user.id
          const higherRank = user.title === '본부장' && account.title === '대표'
          return <tr key={account.id}>
          <td>{account.name}{ownAccount && <small className="ttech-own-account">내 계정</small>}</td><td>{account.email}</td>
          <td>{ownAccount && account.title === '본부장'
            ? <form className="ttech-inline-form ttech-account-form" onSubmit={saveOwnMembership} aria-label="내 소속팀 변경">
              <span>{account.title}</span>
              <select name="teamId" aria-label="내 소속팀" defaultValue={account.teamId ?? ''}>
                <option value="">회사 소속 (팀 없음)</option>{teamOptions}
              </select>
              <button type="submit" disabled={pending}>저장</button>
            </form>
            : ownAccount || higherRank ? <div className="ttech-account-form">
              <span>{account.title}</span>
              <span>{account.teamName}</span>
            </div>
            : <form className="ttech-inline-form ttech-account-form" onSubmit={event => saveAccount(event, account)} aria-label={account.name + ' 소속 변경'}>
              <select name="title" aria-label={account.name + ' 직급'} value={title}
                onChange={event => setPickedTitles(current => ({ ...current, [account.id]: event.target.value as Title }))}>{titles.map(title => {
                const holder = uniqueTitles.includes(title) && accounts.find(other => other.title === title && other.id !== account.id)
                return <option key={title} value={title} disabled={!!holder}>{title}{holder ? ` (${holder.name})` : ''}</option>
              })}</select>
              {title === '본부장' ? <div className="ttech-account-teams">
                <select name="teamId" aria-label={account.name + ' 소속팀'} defaultValue={account.title === '본부장' ? account.teamId ?? '' : ''}>
                  <option value="">회사 소속 (팀 없음)</option>{teamOptions}
                </select>
                <label>담당 팀<select name="managedTeamId" defaultValue={account.managedTeamId ?? ''}>
                  <option value="">담당 팀 없음</option>{teamOptions}
                </select></label>
              </div>
                : uniqueTitles.includes(title) ? <span>회사</span>
                : <select name="teamId" aria-label={account.name + ' 팀'} required defaultValue={account.teamId ?? ''}><option value="" disabled>{account.teamId ? '팀 선택' : '소속 없음 · 팀 선택'}</option>{teamOptions}</select>}
              <button type="submit" disabled={pending}>저장</button>
            </form>}</td>
          <td className="ttech-account-status">
            <strong>{account.isActive ? '활성' : '비활성'}</strong>
            {!ownAccount && !higherRank && <button type="button" className="ttech-link" disabled={pending}
              aria-label={account.name + (account.isActive ? ' 계정 비활성화' : ' 계정 활성화')}
              onClick={() => changeAccess(account)}>{account.isActive ? '비활성화' : '활성화'}</button>}
          </td>
        </tr>})}</tbody>
      </table></div>}
    </section>
    <section className="ttech-panel">
      <h2>조직 변경 이력</h2>
      {!history && <button type="button" className="ttech-secondary" onClick={loadHistory}>변경 이력 보기</button>}
      {history?.length === 0 && <p>기록된 변경이 없습니다.</p>}
      {!!history?.length && <ul>{history.map(entry => <li key={entry.id}>
        <strong>{entry.actor} → {entry.target}</strong> · {new Date(entry.changedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
        <ul>{Object.entries(entry.changes).map(([field, change]) => <li key={field}>
          {changeLabels[field]} {historyValue(field, change.before)} → {historyValue(field, change.after)}
        </li>)}</ul>
      </li>)}</ul>}
    </section>
  </div>
}
